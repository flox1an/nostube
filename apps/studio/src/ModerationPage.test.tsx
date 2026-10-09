import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  matchFilters,
  verifyEvent,
  type EventTemplate,
  type Filter,
  type NostrEvent,
} from 'nostr-tools'
import { of } from 'rxjs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS } from '@nostube/core/instance-config'
import type { AdminState } from './api'
import ModerationPage from './ModerationPage'
import { SignerProvider } from './signer-context'
import './i18n'

const secret = generateSecretKey()
const owner = getPublicKey(secret)
const spammer = 'b'.repeat(64)
const RELAY = 'wss://videos.example.org'

const video = finalizeEvent(
  {
    kind: 34235,
    created_at: 1_000,
    content: '',
    tags: [
      ['d', 'clip'],
      ['title', 'My clip'],
      ['imeta', 'url https://videos.example.org/clip.mp4', 'm video/mp4'],
    ],
  },
  secret
)
const comment = {
  id: 'c'.repeat(64),
  pubkey: spammer,
  kind: 1111,
  created_at: 2_000,
  content: 'buy my coin',
  tags: [
    ['A', `34235:${owner}:clip`],
    ['a', `34235:${owner}:clip`],
    ['e', video.id],
  ],
  sig: 'f'.repeat(128),
} as NostrEvent
// The owner's list as another client left it: a hashtag mute and an encrypted private part.
const list = finalizeEvent(
  { kind: 10000, created_at: 5_000, content: 'nip04-cipher', tags: [['t', 'spam']] },
  secret
)
const events: NostrEvent[] = [video, comment, list]

const publish = vi.fn(async () => [{ ok: true, from: RELAY }])
vi.mock('./instance-client', () => ({
  bootInstanceClient: vi.fn(async () => ({
    config: { creators: [owner], videoSources: [RELAY], interactionRelays: [RELAY] },
    client: {
      relayPool: {
        request: (_relays: string[], filters: Filter[]) =>
          of(...events.filter(e => matchFilters(filters, e))),
        publish,
      },
    },
  })),
}))
vi.mock('@nostube/widgets/instance-providers', () => ({
  InstanceProviders: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@nostube/widgets/hooks/useProfile', () => ({ useProfile: () => undefined }))

const state = {
  config: {
    creators: [owner],
    allowedWriters: [owner],
    videoSources: [RELAY],
    interactionRelays: [RELAY],
    site: { links: DEFAULT_SITE_LINKS },
  },
} as unknown as AdminState

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ mode: 'own', pubkey: null })))
  )
  ;(window as unknown as { nostr: object }).nostr = {
    getPublicKey: async () => owner,
    signEvent: async (template: EventTemplate) =>
      JSON.parse(JSON.stringify(finalizeEvent(template, secret))),
  }
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as unknown as { nostr?: object }).nostr
})

it('mutes a comment author with a signed list built on the current one', async () => {
  render(
    <SignerProvider>
      <ModerationPage state={state} banner={null} />
    </SignerProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Connect my key' }))
  expect(await screen.findByText('buy my coin')).toBeTruthy()
  expect(screen.getByText(/on My clip/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Mute author' }))
  await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
  const [relays, signed] = publish.mock.calls[0] as unknown as [string[], NostrEvent]
  expect(relays).toEqual([RELAY])
  expect(verifyEvent(signed)).toBe(true)
  expect(signed).toMatchObject({ kind: 10000, pubkey: owner, content: 'nip04-cipher' })
  expect(signed.tags).toEqual([
    ['t', 'spam'],
    ['p', spammer],
  ])
  expect(signed.created_at).toBeGreaterThan(list.created_at)
  // The row and the list both offer the way back.
  expect(await screen.findAllByRole('button', { name: 'Unmute author' })).toHaveLength(2)
})
