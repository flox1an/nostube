import type { Event as NostrEvent, EventTemplate } from 'nostr-tools'
import type { RelayPool } from 'applesauce-relay'
import {
  getDefaultVerifiedBlobCache,
  verifySha256,
  type VerifiedBlobCache,
} from '@/lib/p2p/verified-blob-cache'

type Signer = {
  signEvent: (event: EventTemplate) => Promise<NostrEvent>
}

type Subscription = {
  unsubscribe: () => void
}

type MeshSignalType = 'blob-request' | 'offer' | 'answer' | 'ice'

interface MeshSignal {
  protocol: typeof PROTOCOL
  type: MeshSignalType
  requestId: string
  peerId?: string
  sha256?: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

interface P2PBlobMeshIdentity {
  pubkey: string
  signer: Signer
  relays: string[]
}

export interface P2PBlobMeshStats {
  started: boolean
  peerCount: number
  requestsSent: number
  requestsAnswered: number
  bytesReceived: number
  bytesSent: number
  errors: number
}

export interface P2PBlobMesh {
  start(identity: P2PBlobMeshIdentity): void
  stop(): void
  enabled(): boolean
  get(sha256: string, signal?: AbortSignal): Promise<Uint8Array | null>
  getStats(): P2PBlobMeshStats
}

interface PendingBlobRequest {
  requestId: string
  sha256: string
  peerId?: string
  chunks: Uint8Array[]
  expectedSize?: number
  timeout: ReturnType<typeof setTimeout>
  resolve: (bytes: Uint8Array | null) => void
  reject: (error: Error) => void
}

interface MeshPeer {
  id: string
  remotePubkey: string
  pc: RTCPeerConnection
  requestId: string
  role: 'requester' | 'seeder'
}

const PROTOCOL = 'nostube-p2p-hls-v1'
const SIGNAL_KIND = 25050
const SIGNAL_TOPIC = 'nostube-p2p-hls'
const REQUEST_TIMEOUT_MS = 7000
const CHUNK_SIZE = 64 * 1024
const MAX_BUFFERED_AMOUNT = 1024 * 1024
const MAX_TRANSFER_BYTES = 128 * 1024 * 1024
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

let defaultMesh: P2PNostrWebRtcBlobMesh | null = null

function nowInSeconds() {
  return Math.floor(Date.now() / 1000)
}

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeSha256(sha256: string) {
  return sha256.toLowerCase()
}

function parseSignal(event: NostrEvent): MeshSignal | null {
  try {
    const parsed = JSON.parse(event.content) as Partial<MeshSignal>
    if (parsed.protocol !== PROTOCOL || !parsed.type || !parsed.requestId) return null
    return parsed as MeshSignal
  } catch {
    return null
  }
}

function concatChunks(chunks: Uint8Array[], expectedSize?: number) {
  const size = expectedSize ?? chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function messageDataToBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

async function waitForBufferedAmount(channel: RTCDataChannel) {
  while (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

export class P2PNostrWebRtcBlobMesh implements P2PBlobMesh {
  private identity: P2PBlobMeshIdentity | null = null
  private subscription: Subscription | null = null
  private peers = new Map<string, MeshPeer>()
  private pendingRequests = new Map<string, PendingBlobRequest>()
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>()
  private stats: P2PBlobMeshStats = {
    started: false,
    peerCount: 0,
    requestsSent: 0,
    requestsAnswered: 0,
    bytesReceived: 0,
    bytesSent: 0,
    errors: 0,
  }

  constructor(
    private readonly relayPool: RelayPool,
    private readonly cache: VerifiedBlobCache = getDefaultVerifiedBlobCache()
  ) {}

  start(identity: P2PBlobMeshIdentity) {
    if (!this.isSupported()) return

    this.stop()
    this.identity = {
      ...identity,
      relays: [...new Set(identity.relays)].filter(Boolean),
    }

    if (this.identity.relays.length === 0) return

    this.subscription = this.relayPool
      .subscription(this.identity.relays, [
        {
          kinds: [SIGNAL_KIND],
          '#t': [SIGNAL_TOPIC],
          since: nowInSeconds(),
        },
        {
          kinds: [SIGNAL_KIND],
          '#p': [identity.pubkey],
          since: nowInSeconds(),
        },
      ])
      .subscribe({
        next: event => {
          if (typeof event === 'string') return
          void this.handleSignalEvent(event)
        },
        error: error => {
          this.stats.errors += 1
          console.warn('[P2PBlobMesh] signaling subscription failed', error)
        },
      })

    this.stats.started = true
  }

  stop() {
    this.subscription?.unsubscribe()
    this.subscription = null
    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timeout)
      request.resolve(null)
    }
    this.pendingRequests.clear()
    for (const peer of this.peers.values()) {
      peer.pc.close()
    }
    this.peers.clear()
    this.pendingIceCandidates.clear()
    this.identity = null
    this.stats.started = false
    this.stats.peerCount = 0
  }

  enabled() {
    return this.stats.started && this.isSupported() && this.identity !== null
  }

  async get(sha256: string, signal?: AbortSignal): Promise<Uint8Array | null> {
    if (!this.enabled() || signal?.aborted) return null

    const normalizedHash = normalizeSha256(sha256)
    const requestId = randomId()

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        this.closeRequestPeers(requestId)
        resolve(null)
      }, REQUEST_TIMEOUT_MS)

      const pending: PendingBlobRequest = {
        requestId,
        sha256: normalizedHash,
        chunks: [],
        timeout,
        resolve,
        reject,
      }
      this.pendingRequests.set(requestId, pending)

      const abort = () => {
        clearTimeout(timeout)
        this.pendingRequests.delete(requestId)
        this.closeRequestPeers(requestId)
        resolve(null)
      }
      signal?.addEventListener('abort', abort, { once: true })

      this.publishSignal({
        protocol: PROTOCOL,
        type: 'blob-request',
        requestId,
        sha256: normalizedHash,
      })
        .then(() => {
          this.stats.requestsSent += 1
        })
        .catch(error => {
          this.stats.errors += 1
          clearTimeout(timeout)
          this.pendingRequests.delete(requestId)
          signal?.removeEventListener('abort', abort)
          reject(error instanceof Error ? error : new Error('Failed to publish P2P request'))
        })
    })
  }

  getStats() {
    return {
      ...this.stats,
      peerCount: this.peers.size,
    }
  }

  private isSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof RTCPeerConnection !== 'undefined' &&
      typeof RTCSessionDescription !== 'undefined' &&
      typeof RTCIceCandidate !== 'undefined'
    )
  }

  private async handleSignalEvent(event: NostrEvent) {
    const identity = this.identity
    if (!identity || event.pubkey === identity.pubkey) return

    const signal = parseSignal(event)
    if (!signal) return

    switch (signal.type) {
      case 'blob-request':
        await this.handleBlobRequest(event.pubkey, signal)
        break
      case 'offer':
        await this.handleOffer(event.pubkey, signal)
        break
      case 'answer':
        await this.handleAnswer(signal)
        break
      case 'ice':
        await this.handleIce(signal)
        break
    }
  }

  private async handleBlobRequest(remotePubkey: string, signal: MeshSignal) {
    if (!signal.sha256 || !this.identity) return

    const cached = await this.cache.get(signal.sha256)
    if (!cached) return

    const peerId = randomId()
    const pc = this.createPeerConnection(peerId, remotePubkey, signal.requestId, 'seeder')
    const channel = pc.createDataChannel('blob', { ordered: true })
    this.setupSeederChannel(channel, signal.requestId, signal.sha256, cached.bytes)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.publishSignal(
      {
        protocol: PROTOCOL,
        type: 'offer',
        requestId: signal.requestId,
        peerId,
        sha256: signal.sha256,
        sdp: offer,
      },
      remotePubkey
    )
  }

  private async handleOffer(remotePubkey: string, signal: MeshSignal) {
    if (!signal.peerId || !signal.sdp || !signal.sha256) return

    const pending = this.pendingRequests.get(signal.requestId)
    if (!pending || pending.sha256 !== normalizeSha256(signal.sha256) || pending.peerId) return

    pending.peerId = signal.peerId
    const pc = this.createPeerConnection(signal.peerId, remotePubkey, signal.requestId, 'requester')
    pc.ondatachannel = event => {
      this.setupRequesterChannel(event.channel, pending)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
    await this.flushPendingIce(signal.peerId, pc)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await this.publishSignal(
      {
        protocol: PROTOCOL,
        type: 'answer',
        requestId: signal.requestId,
        peerId: signal.peerId,
        sdp: answer,
      },
      remotePubkey
    )
  }

  private async handleAnswer(signal: MeshSignal) {
    if (!signal.peerId || !signal.sdp) return
    const peer = this.peers.get(signal.peerId)
    if (!peer) return
    await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
    await this.flushPendingIce(signal.peerId, peer.pc)
  }

  private async handleIce(signal: MeshSignal) {
    if (!signal.peerId || !signal.candidate) return
    const peer = this.peers.get(signal.peerId)
    if (!peer || !peer.pc.remoteDescription) {
      const pending = this.pendingIceCandidates.get(signal.peerId) ?? []
      pending.push(signal.candidate)
      this.pendingIceCandidates.set(signal.peerId, pending)
      return
    }
    await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
  }

  private createPeerConnection(
    peerId: string,
    remotePubkey: string,
    requestId: string,
    role: MeshPeer['role']
  ) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const peer: MeshPeer = {
      id: peerId,
      remotePubkey,
      pc,
      requestId,
      role,
    }
    this.peers.set(peerId, peer)

    pc.onicecandidate = event => {
      if (!event.candidate) return
      void this.publishSignal(
        {
          protocol: PROTOCOL,
          type: 'ice',
          requestId,
          peerId,
          candidate: event.candidate.toJSON(),
        },
        remotePubkey
      )
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        this.closePeer(peerId)
      }
    }

    return pc
  }

  private setupRequesterChannel(channel: RTCDataChannel, pending: PendingBlobRequest) {
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => {
      channel.send(
        JSON.stringify({
          type: 'get',
          requestId: pending.requestId,
          sha256: pending.sha256,
        })
      )
    }
    channel.onmessage = event => {
      if (typeof event.data === 'string') {
        void this.handleRequesterControlMessage(channel, pending, event.data)
        return
      }

      const bytes = messageDataToBytes(event.data)
      if (
        bytes &&
        pending.chunks.reduce((total, chunk) => total + chunk.byteLength, 0) + bytes.byteLength >
          MAX_TRANSFER_BYTES
      ) {
        this.stats.errors += 1
        this.finishPendingRequest(pending, null)
        channel.close()
        return
      }
      if (bytes) pending.chunks.push(bytes)
    }
    channel.onerror = () => {
      this.stats.errors += 1
      this.finishPendingRequest(pending, null)
    }
    channel.onclose = () => {
      if (this.pendingRequests.has(pending.requestId)) {
        this.finishPendingRequest(pending, null)
      }
    }
  }

  private async handleRequesterControlMessage(
    channel: RTCDataChannel,
    pending: PendingBlobRequest,
    data: string
  ) {
    let message: {
      type: 'blob-start' | 'blob-end' | 'blob-error'
      requestId: string
      sha256?: string
      size?: number
      error?: string
    }
    try {
      message = JSON.parse(data) as typeof message
    } catch {
      this.stats.errors += 1
      this.finishPendingRequest(pending, null)
      channel.close()
      return
    }

    if (message.requestId !== pending.requestId) return

    if (message.type === 'blob-start') {
      if ((message.size ?? 0) > MAX_TRANSFER_BYTES) {
        this.stats.errors += 1
        this.finishPendingRequest(pending, null)
        channel.close()
        return
      }
      pending.expectedSize = message.size
      return
    }

    if (message.type === 'blob-error') {
      this.finishPendingRequest(pending, null)
      channel.close()
      return
    }

    const bytes = concatChunks(pending.chunks, pending.expectedSize)
    const valid = await verifySha256(bytes, pending.sha256)
    if (!valid) {
      this.stats.errors += 1
      this.finishPendingRequest(pending, null)
      channel.close()
      return
    }

    this.stats.bytesReceived += bytes.byteLength
    this.finishPendingRequest(pending, bytes)
    channel.close()
  }

  private setupSeederChannel(
    channel: RTCDataChannel,
    requestId: string,
    sha256: string,
    bytes: Uint8Array
  ) {
    channel.binaryType = 'arraybuffer'
    channel.onmessage = event => {
      if (typeof event.data !== 'string') return
      let message: {
        type?: string
        requestId?: string
        sha256?: string
      }
      try {
        message = JSON.parse(event.data) as typeof message
      } catch {
        this.stats.errors += 1
        return
      }
      if (message.type !== 'get' || message.requestId !== requestId || message.sha256 !== sha256) {
        return
      }
      void this.sendBlob(channel, requestId, sha256, bytes)
    }
    channel.onerror = () => {
      this.stats.errors += 1
    }
  }

  private async sendBlob(
    channel: RTCDataChannel,
    requestId: string,
    sha256: string,
    bytes: Uint8Array
  ) {
    try {
      channel.send(
        JSON.stringify({
          type: 'blob-start',
          requestId,
          sha256,
          size: bytes.byteLength,
        })
      )

      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_SIZE) {
        await waitForBufferedAmount(channel)
        const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
        channel.send(chunk)
      }

      await waitForBufferedAmount(channel)
      channel.send(JSON.stringify({ type: 'blob-end', requestId, sha256 }))
      this.stats.requestsAnswered += 1
      this.stats.bytesSent += bytes.byteLength
      setTimeout(() => {
        channel.close()
        this.closeRequestPeers(requestId)
      }, 250)
    } catch (error) {
      this.stats.errors += 1
      if (channel.readyState === 'open') {
        channel.send(
          JSON.stringify({
            type: 'blob-error',
            requestId,
            sha256,
            error: error instanceof Error ? error.message : String(error),
          })
        )
      }
    }
  }

  private finishPendingRequest(pending: PendingBlobRequest, bytes: Uint8Array | null) {
    clearTimeout(pending.timeout)
    this.pendingRequests.delete(pending.requestId)
    this.closeRequestPeers(pending.requestId)
    pending.resolve(bytes)
  }

  private closeRequestPeers(requestId: string) {
    for (const peer of this.peers.values()) {
      if (peer.requestId === requestId) {
        this.closePeer(peer.id)
      }
    }
  }

  private closePeer(peerId: string) {
    const peer = this.peers.get(peerId)
    if (!peer) return
    peer.pc.close()
    this.peers.delete(peerId)
    this.pendingIceCandidates.delete(peerId)
  }

  private async flushPendingIce(peerId: string, pc: RTCPeerConnection) {
    const pending = this.pendingIceCandidates.get(peerId) ?? []
    this.pendingIceCandidates.delete(peerId)
    for (const candidate of pending) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  private async publishSignal(signal: MeshSignal, recipientPubkey?: string) {
    const identity = this.identity
    if (!identity) return

    const tags = recipientPubkey
      ? [
          ['p', recipientPubkey],
          ['t', SIGNAL_TOPIC],
        ]
      : [['t', SIGNAL_TOPIC]]

    if (signal.sha256) tags.push(['x', signal.sha256])

    const event = await identity.signer.signEvent({
      kind: SIGNAL_KIND,
      content: JSON.stringify(signal),
      tags,
      created_at: nowInSeconds(),
    })
    await this.relayPool.publish(identity.relays, event)
  }
}

export function getDefaultP2PBlobMesh(relayPool: RelayPool) {
  defaultMesh ??= new P2PNostrWebRtcBlobMesh(relayPool)
  return defaultMesh
}
