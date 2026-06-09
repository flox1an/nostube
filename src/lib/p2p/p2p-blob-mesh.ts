import { decode, encode } from '@msgpack/msgpack'
import type { Event as NostrEvent, EventTemplate } from 'nostr-tools'
import { finalizeEvent, generateSecretKey, getEventHash } from 'nostr-tools'
import { v2 as nip44 } from 'nostr-tools/nip44'
import { bytesToHex, hexToBytes } from 'nostr-tools/utils'
import type { RelayPool } from 'applesauce-relay'
import {
  getDefaultVerifiedBlobCache,
  verifySha256,
  type VerifiedBlobCache,
} from '@/lib/p2p/verified-blob-cache'

type Signer = {
  signEvent: (event: EventTemplate) => Promise<NostrEvent>
  nip44?: {
    encrypt: (pubkey: string, plaintext: string) => Promise<string>
    decrypt: (pubkey: string, ciphertext: string) => Promise<string>
  }
  key?: Uint8Array
}

type Subscription = {
  unsubscribe: () => void
}

interface HelloMessage {
  type: 'hello'
  peerId: string
  roots?: string[]
}

interface OfferMessage {
  type: 'offer'
  peerId: string
  targetPeerId: string
  sdp: string
}

interface AnswerMessage {
  type: 'answer'
  peerId: string
  targetPeerId: string
  sdp: string
}

interface CandidateMessage {
  type: 'candidate'
  peerId: string
  targetPeerId: string
  candidate: string
  sdpMLineIndex?: number | null
  sdpMid?: string | null
}

interface CandidatesMessage {
  type: 'candidates'
  peerId: string
  targetPeerId: string
  candidates: Array<{
    candidate: string
    sdpMLineIndex?: number | null
    sdpMid?: string | null
  }>
}

type DirectedSignal = OfferMessage | AnswerMessage | CandidateMessage | CandidatesMessage
type SignalingMessage = HelloMessage | DirectedSignal

interface DataRequest {
  h: Uint8Array
  htl?: number
}

interface DataResponse {
  h: Uint8Array
  d: Uint8Array
  i?: number
  n?: number
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
  hash: Uint8Array
  fragments: Map<number, Uint8Array>
  sentPeerIds: Set<string>
  totalFragments?: number
  receivedBytes: number
  timeout: ReturnType<typeof setTimeout>
  resolve: (bytes: Uint8Array | null) => void
  reject: (error: Error) => void
}

interface MeshPeer {
  id: string
  remotePubkey: string
  pc: RTCPeerConnection
  channel?: RTCDataChannel
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
}

const SIGNAL_KIND = 25050
const HELLO_TAG = 'hello'
const DATA_CHANNEL_LABEL = 'hashtree'
const REQUEST_TIMEOUT_MS = 7000
const HELLO_INTERVAL_MS = 3000
const REQUEST_POLL_MS = 100
const FRAGMENT_SIZE = 32 * 1024
const MAX_TRANSFER_BYTES = 128 * 1024 * 1024
const MSG_TYPE_REQUEST = 0x00
const MSG_TYPE_RESPONSE = 0x01
const MAX_HTL = 10
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

function encodeMessage(type: number, body: DataRequest | DataResponse) {
  const encoded = encode(body)
  const bytes = new Uint8Array(1 + encoded.byteLength)
  bytes[0] = type
  bytes.set(encoded, 1)
  return bytes
}

function encodeRequest(request: DataRequest) {
  return encodeMessage(MSG_TYPE_REQUEST, request)
}

function encodeResponse(response: DataResponse) {
  return encodeMessage(MSG_TYPE_RESPONSE, response)
}

function parseDataMessage(
  data: unknown
):
  | { type: typeof MSG_TYPE_REQUEST; body: DataRequest }
  | { type: typeof MSG_TYPE_RESPONSE; body: DataResponse }
  | null {
  const bytes = messageDataToBytes(data)
  if (!bytes || bytes.byteLength < 2) return null

  try {
    const type = bytes[0]
    const body = decode(bytes.slice(1))
    if (type === MSG_TYPE_REQUEST) {
      return { type, body: body as DataRequest }
    }
    if (type === MSG_TYPE_RESPONSE) {
      return { type, body: body as DataResponse }
    }
    return null
  } catch {
    return null
  }
}

function messageDataToBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

function concatFragments(fragments: Map<number, Uint8Array>, total: number) {
  const ordered: Uint8Array[] = []
  let size = 0

  for (let i = 0; i < total; i++) {
    const fragment = fragments.get(i)
    if (!fragment) return null
    ordered.push(fragment)
    size += fragment.byteLength
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const fragment of ordered) {
    bytes.set(fragment, offset)
    offset += fragment.byteLength
  }
  return bytes
}

function createRequest(hash: Uint8Array): DataRequest {
  return { h: hash, htl: MAX_HTL }
}

function createResponse(hash: Uint8Array, data: Uint8Array, index?: number, total?: number) {
  const response: DataResponse = { h: hash, d: data }
  if (index !== undefined && total !== undefined) {
    response.i = index
    response.n = total
  }
  return response
}

function parsePlainSignal(content: string): SignalingMessage | null {
  try {
    const value = JSON.parse(content) as Partial<SignalingMessage>
    if (!value || typeof value.type !== 'string') return null
    if (value.type === 'hello' && typeof value.peerId === 'string') return value as HelloMessage
    if (
      ['offer', 'answer', 'candidate', 'candidates'].includes(value.type) &&
      typeof value.peerId === 'string' &&
      typeof (value as DirectedSignal).targetPeerId === 'string'
    ) {
      return value as DirectedSignal
    }
    return null
  } catch {
    return null
  }
}

async function encryptForRecipient(signer: Signer, recipientPubkey: string, plaintext: string) {
  if (signer.nip44) return signer.nip44.encrypt(recipientPubkey, plaintext)
  if (signer.key) {
    return nip44.encrypt(plaintext, nip44.utils.getConversationKey(signer.key, recipientPubkey))
  }
  return null
}

async function decryptFromSender(signer: Signer, senderPubkey: string, ciphertext: string) {
  if (signer.nip44) return signer.nip44.decrypt(senderPubkey, ciphertext)
  if (signer.key)
    return nip44.decrypt(ciphertext, nip44.utils.getConversationKey(signer.key, senderPubkey))
  return null
}

async function createGiftWrap(
  rumor: { kind: number; content: string; tags: string[][]; created_at: number },
  signer: Signer,
  senderPubkey: string,
  recipientPubkey: string
) {
  const rumorWithPubkey = {
    ...rumor,
    pubkey: senderPubkey,
  }
  const rumorEvent = {
    ...rumorWithPubkey,
    id: getEventHash(rumorWithPubkey),
  }
  const sealContent = await encryptForRecipient(signer, recipientPubkey, JSON.stringify(rumorEvent))
  if (!sealContent) return null

  const seal = await signer.signEvent({
    kind: 13,
    content: sealContent,
    tags: [],
    created_at: nowInSeconds(),
  })
  const wrapKey = generateSecretKey()
  return finalizeEvent(
    {
      kind: SIGNAL_KIND,
      content: nip44.encrypt(
        JSON.stringify(seal),
        nip44.utils.getConversationKey(wrapKey, recipientPubkey)
      ),
      tags: [['p', recipientPubkey]],
      created_at: nowInSeconds(),
    },
    wrapKey
  )
}

async function unwrapGiftWrap(event: NostrEvent, signer: Signer) {
  const sealJson = await decryptFromSender(signer, event.pubkey, event.content)
  if (!sealJson) return null

  const seal = JSON.parse(sealJson) as NostrEvent
  const rumorJson = await decryptFromSender(signer, seal.pubkey, seal.content)
  if (!rumorJson) return null

  return JSON.parse(rumorJson) as {
    pubkey: string
    kind: number
    content: string
    tags: string[][]
  }
}

export class P2PNostrWebRtcBlobMesh implements P2PBlobMesh {
  private identity: P2PBlobMeshIdentity | null = null
  private subscription: Subscription | null = null
  private helloInterval: ReturnType<typeof setInterval> | null = null
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
          '#l': [HELLO_TAG],
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
    void this.publishHello()
    this.helloInterval = setInterval(() => {
      void this.publishHello()
    }, HELLO_INTERVAL_MS)
  }

  stop() {
    this.subscription?.unsubscribe()
    this.subscription = null
    if (this.helloInterval) {
      clearInterval(this.helloInterval)
      this.helloInterval = null
    }
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
    const existing = this.pendingRequests.get(normalizedHash)
    if (existing) return null

    let hash: Uint8Array
    try {
      hash = hexToBytes(normalizedHash)
    } catch {
      return null
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(normalizedHash)
        resolve(null)
      }, REQUEST_TIMEOUT_MS)

      const pending: PendingBlobRequest = {
        requestId: randomId(),
        sha256: normalizedHash,
        hash,
        fragments: new Map(),
        sentPeerIds: new Set(),
        receivedBytes: 0,
        timeout,
        resolve,
        reject,
      }
      this.pendingRequests.set(normalizedHash, pending)

      const abort = () => {
        clearTimeout(timeout)
        this.pendingRequests.delete(normalizedHash)
        resolve(null)
      }
      signal?.addEventListener('abort', abort, { once: true })

      this.sendRequestToConnectedPeers(pending)
      void this.publishHello()

      const poll = setInterval(() => {
        if (!this.pendingRequests.has(normalizedHash)) {
          clearInterval(poll)
          signal?.removeEventListener('abort', abort)
          return
        }
        this.sendRequestToConnectedPeers(pending)
      }, REQUEST_POLL_MS)

      setTimeout(() => {
        clearInterval(poll)
        signal?.removeEventListener('abort', abort)
      }, REQUEST_TIMEOUT_MS)
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

    const helloTag = event.tags.find(tag => tag[0] === 'l')?.[1]
    if (helloTag === HELLO_TAG) {
      const peerId = event.tags.find(tag => tag[0] === 'peerId')?.[1] ?? event.pubkey
      await this.handleHello(event.pubkey, { type: 'hello', peerId })
      return
    }

    const signal = await this.parseDirectedSignal(event)
    if (!signal || signal.targetPeerId !== identity.pubkey) return

    switch (signal.type) {
      case 'offer':
        await this.handleOffer(event.pubkey, signal)
        break
      case 'answer':
        await this.handleAnswer(signal)
        break
      case 'candidate':
        await this.handleCandidate(signal)
        break
      case 'candidates':
        for (const candidate of signal.candidates) {
          await this.handleCandidate({ ...signal, type: 'candidate', ...candidate })
        }
        break
    }
  }

  private async parseDirectedSignal(event: NostrEvent): Promise<DirectedSignal | null> {
    const identity = this.identity
    if (!identity) return null

    const plaintext = parsePlainSignal(event.content)
    if (plaintext?.type !== 'hello') return plaintext

    try {
      const rumor = await unwrapGiftWrap(event, identity.signer)
      if (!rumor) return null
      const unwrapped = parsePlainSignal(rumor.content)
      if (unwrapped?.type === 'hello') return null
      return unwrapped
    } catch {
      return null
    }
  }

  private async handleHello(remotePubkey: string, signal: HelloMessage) {
    if (!this.identity || signal.peerId !== remotePubkey) return
    if (this.peers.has(remotePubkey)) return

    const peer = this.createPeerConnection(remotePubkey)

    if (this.identity.pubkey < remotePubkey) {
      peer.channel = peer.pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: false })
      this.setupDataChannel(peer, peer.channel)
      await this.sendOffer(peer)
    }
  }

  private async handleOffer(remotePubkey: string, signal: OfferMessage) {
    if (!this.identity || signal.peerId !== remotePubkey) return

    const peer = this.peers.get(remotePubkey) ?? this.createPeerConnection(remotePubkey)
    const offerCollision = peer.makingOffer || peer.pc.signalingState !== 'stable'
    peer.ignoreOffer = !peer.polite && offerCollision
    if (peer.ignoreOffer) return

    if (offerCollision) {
      await peer.pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit)
    }

    await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
    await this.flushPendingIce(remotePubkey, peer.pc)
    const answer = await peer.pc.createAnswer()
    await peer.pc.setLocalDescription(answer)
    await this.publishDirectedSignal({
      type: 'answer',
      peerId: this.identity.pubkey,
      targetPeerId: remotePubkey,
      sdp: answer.sdp ?? '',
    })
  }

  private async handleAnswer(signal: AnswerMessage) {
    const peer = this.peers.get(signal.peerId)
    if (!peer || peer.pc.signalingState === 'stable') return
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
    await this.flushPendingIce(signal.peerId, peer.pc)
  }

  private async handleCandidate(signal: CandidateMessage) {
    const peer = this.peers.get(signal.peerId)
    const candidate: RTCIceCandidateInit = {
      candidate: signal.candidate,
      sdpMLineIndex: signal.sdpMLineIndex,
      sdpMid: signal.sdpMid,
    }

    if (!peer || !peer.pc.remoteDescription) {
      const pending = this.pendingIceCandidates.get(signal.peerId) ?? []
      pending.push(candidate)
      this.pendingIceCandidates.set(signal.peerId, pending)
      return
    }
    await peer.pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  private createPeerConnection(remotePubkey: string) {
    const identity = this.identity
    if (!identity) throw new Error('P2P mesh identity is missing')

    const existing = this.peers.get(remotePubkey)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const peer: MeshPeer = {
      id: remotePubkey,
      remotePubkey,
      pc,
      polite: identity.pubkey > remotePubkey,
      makingOffer: false,
      ignoreOffer: false,
    }
    this.peers.set(remotePubkey, peer)

    pc.onicecandidate = event => {
      if (!event.candidate || !this.identity) return
      const candidate = event.candidate.toJSON()
      void this.publishDirectedSignal({
        type: 'candidate',
        peerId: this.identity.pubkey,
        targetPeerId: remotePubkey,
        candidate: candidate.candidate ?? '',
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid,
      })
    }
    pc.ondatachannel = event => {
      peer.channel = event.channel
      this.setupDataChannel(peer, event.channel)
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        this.closePeer(remotePubkey)
      }
    }

    return peer
  }

  private setupDataChannel(peer: MeshPeer, channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => {
      this.sendPendingRequestsToPeer(peer)
    }
    channel.onmessage = event => {
      void this.handleDataChannelMessage(peer, event.data)
    }
    channel.onerror = () => {
      this.stats.errors += 1
    }
  }

  private async handleDataChannelMessage(peer: MeshPeer, data: unknown) {
    const message = parseDataMessage(data)
    if (!message) {
      this.stats.errors += 1
      return
    }

    if (message.type === MSG_TYPE_REQUEST) {
      await this.handleDataRequest(peer, message.body)
      return
    }

    await this.handleDataResponse(message.body)
  }

  private async handleDataRequest(peer: MeshPeer, request: DataRequest) {
    const sha256 = bytesToHex(request.h)
    const cached = await this.cache.get(sha256)
    if (!cached || !peer.channel || peer.channel.readyState !== 'open') return

    const totalFragments = Math.ceil(cached.bytes.byteLength / FRAGMENT_SIZE)
    for (let i = 0; i < totalFragments; i++) {
      const start = i * FRAGMENT_SIZE
      const end = Math.min(start + FRAGMENT_SIZE, cached.bytes.byteLength)
      const data = cached.bytes.slice(start, end)
      const response =
        totalFragments > 1
          ? createResponse(request.h, data, i, totalFragments)
          : createResponse(request.h, data)
      peer.channel.send(encodeResponse(response))
    }

    this.stats.requestsAnswered += 1
    this.stats.bytesSent += cached.bytes.byteLength
  }

  private async handleDataResponse(response: DataResponse) {
    const sha256 = bytesToHex(response.h)
    const pending = this.pendingRequests.get(sha256)
    if (!pending) return

    if (response.i !== undefined && response.n !== undefined) {
      if (pending.fragments.has(response.i)) return
      pending.fragments.set(response.i, response.d)
      pending.totalFragments = response.n
      pending.receivedBytes += response.d.byteLength

      if (pending.receivedBytes > MAX_TRANSFER_BYTES) {
        this.stats.errors += 1
        this.finishPendingRequest(pending, null)
        return
      }

      if (pending.fragments.size < response.n) return
      const bytes = concatFragments(pending.fragments, response.n)
      if (!bytes) return
      await this.finishVerifiedResponse(pending, bytes)
      return
    }

    await this.finishVerifiedResponse(pending, response.d)
  }

  private async finishVerifiedResponse(pending: PendingBlobRequest, bytes: Uint8Array) {
    const valid = await verifySha256(bytes, pending.sha256)
    if (!valid) {
      this.stats.errors += 1
      this.finishPendingRequest(pending, null)
      return
    }

    this.stats.bytesReceived += bytes.byteLength
    this.finishPendingRequest(pending, bytes)
  }

  private sendRequestToConnectedPeers(pending: PendingBlobRequest) {
    for (const peer of this.peers.values()) {
      this.sendRequestToPeer(peer, pending)
    }
  }

  private sendPendingRequestsToPeer(peer: MeshPeer) {
    for (const pending of this.pendingRequests.values()) {
      this.sendRequestToPeer(peer, pending)
    }
  }

  private sendRequestToPeer(peer: MeshPeer, pending: PendingBlobRequest) {
    if (!peer.channel || peer.channel.readyState !== 'open') return
    if (pending.sentPeerIds.has(peer.id)) return
    peer.channel.send(encodeRequest(createRequest(pending.hash)))
    pending.sentPeerIds.add(peer.id)
    this.stats.requestsSent += 1
  }

  private finishPendingRequest(pending: PendingBlobRequest, bytes: Uint8Array | null) {
    clearTimeout(pending.timeout)
    this.pendingRequests.delete(pending.sha256)
    pending.resolve(bytes)
  }

  private closePeer(peerId: string) {
    const peer = this.peers.get(peerId)
    if (!peer) return
    peer.channel?.close()
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

  private async sendOffer(peer: MeshPeer) {
    const identity = this.identity
    if (!identity) return

    try {
      peer.makingOffer = true
      const offer = await peer.pc.createOffer()
      await peer.pc.setLocalDescription(offer)
      await this.publishDirectedSignal({
        type: 'offer',
        peerId: identity.pubkey,
        targetPeerId: peer.remotePubkey,
        sdp: offer.sdp ?? '',
      })
    } finally {
      peer.makingOffer = false
    }
  }

  private async publishHello() {
    const identity = this.identity
    if (!identity) return

    const event = await identity.signer.signEvent({
      kind: SIGNAL_KIND,
      content: '',
      tags: [
        ['l', HELLO_TAG],
        ['peerId', identity.pubkey],
        ['expiration', String(nowInSeconds() + 60)],
      ],
      created_at: nowInSeconds(),
    })
    await this.relayPool.publish(identity.relays, event)
  }

  private async publishDirectedSignal(signal: DirectedSignal) {
    const identity = this.identity
    if (!identity) return

    const event = await createGiftWrap(
      {
        kind: SIGNAL_KIND,
        content: JSON.stringify(signal),
        tags: [],
        created_at: nowInSeconds(),
      },
      identity.signer,
      identity.pubkey,
      signal.targetPeerId
    )
    if (event) {
      await this.relayPool.publish(identity.relays, event)
      return
    }

    const fallbackEvent = await identity.signer.signEvent({
      kind: SIGNAL_KIND,
      content: JSON.stringify(signal),
      tags: [['p', signal.targetPeerId]],
      created_at: nowInSeconds(),
    })
    await this.relayPool.publish(identity.relays, fallbackEvent)
  }
}

export function getDefaultP2PBlobMesh(relayPool: RelayPool) {
  defaultMesh ??= new P2PNostrWebRtcBlobMesh(relayPool)
  return defaultMesh
}
