import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finalizeEvent,
  generateSecretKey,
  matchFilter,
  type Filter,
  type NostrEvent,
} from 'nostr-tools'
import { NostrClient } from './nostr-client'

const key = generateSecretKey()
const otherKey = generateSecretKey()
const video = (created_at: number, title: string) =>
  finalizeEvent(
    {
      kind: 34235,
      created_at,
      content: '',
      tags: [
        ['d', 'clip'],
        ['title', title],
      ],
    },
    key
  )
const original = video(100, 'Original')
const updated = video(101, 'Updated')
const address = {
  type: 'address' as const,
  data: { kind: 34235, pubkey: original.pubkey, identifier: 'clip', relays: [] },
}
const coordinate = `34235:${original.pubkey}:clip`
const deletion = (created_at: number, signingKey = key) =>
  finalizeEvent(
    {
      kind: 5,
      created_at,
      content: '',
      tags: [
        ['a', coordinate],
        ['e', original.id],
      ],
    },
    signingKey
  )

/** A relay transport returning matching signed events followed by EOSE. */
function clientWith(events: NostrEvent[]) {
  const socket = new EventTarget()
  const ws = Object.assign(socket, {
    send: (json: string) => {
      const [type, id, ...filters] = JSON.parse(json) as [string, string, ...Filter[]]
      if (type !== 'REQ') return
      queueMicrotask(() => {
        for (const event of events) {
          if (filters.some(filter => matchFilter(filter, event))) {
            socket.dispatchEvent(
              new MessageEvent('message', { data: JSON.stringify(['EVENT', id, event]) })
            )
          }
        }
        socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(['EOSE', id]) }))
      })
    },
  })
  const client = new NostrClient(['wss://instance.example'])
  vi.spyOn(client, 'connectRelay').mockResolvedValue(ws as unknown as WebSocket)
  return client
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('embed video lifecycle', () => {
  it('shows the latest metadata even when an older version was embedded before', async () => {
    localStorage.setItem(
      `nostube-embed-event-${coordinate}`,
      JSON.stringify({ event: original, fetchedAt: Date.now() })
    )
    expect((await clientWith([original, updated]).fetchEvent(address)).id).toBe(updated.id)
  })

  it('does not serve a video deleted by its author even if a relay retains it', async () => {
    await expect(clientWith([updated, deletion(102)]).fetchEvent(address)).rejects.toThrow(
      'deleted'
    )
  })

  it('ignores another author’s deletion and a deletion older than the current version', async () => {
    const event = await clientWith([updated, deletion(102, otherKey), deletion(100)]).fetchEvent(
      address
    )
    expect(event.id).toBe(updated.id)
  })
})
