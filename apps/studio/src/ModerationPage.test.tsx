import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const videoHash = 'a'.repeat(64)
const video = finalizeEvent(
  {
    kind: 34235,
    created_at: 1_000,
    content: '',
    tags: [
      ['d', 'clip'],
      ['title', 'My clip'],
      ['imeta', 'url https://videos.example.org/clip.mp4', 'm video/mp4', `x ${videoHash}`],
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
const videoReport = {
  id: 'd'.repeat(64),
  pubkey: spammer,
  kind: 1984,
  created_at: 3_000,
  content: 'actually fine, reporter was wrong',
  tags: [
    ['e', video.id, 'illegal'],
    ['p', owner],
  ],
  sig: 'f'.repeat(128),
} as NostrEvent
const commentReport = {
  id: 'e'.repeat(64),
  pubkey: owner,
  kind: 1984,
  created_at: 4_000,
  content: '',
  tags: [
    ['e', comment.id, 'spam'],
    ['p', spammer, 'spam'],
  ],
  sig: 'f'.repeat(128),
} as NostrEvent
const profileReport = {
  id: 'f'.repeat(64),
  pubkey: spammer,
  kind: 1984,
  created_at: 4_500,
  content: '',
  // A profile report with no e tag against the creator's own key (ADR 0011): the self-note
  // branch, not a mute button.
  tags: [['p', owner, 'harassment']],
  sig: 'f'.repeat(128),
} as NostrEvent
const bareXReport = {
  id: '0'.repeat(64),
  pubkey: spammer,
  kind: 1984,
  created_at: 4_800,
  content: '',
  // No e tag: the BUD-09 bridge's fallback, resolved against the video's own media hash.
  tags: [['x', videoHash, 'malware']],
  sig: 'f'.repeat(128),
} as NostrEvent
const events: NostrEvent[] = [
  video,
  comment,
  list,
  videoReport,
  commentReport,
  profileReport,
  bareXReport,
]

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
  publish.mockClear()
  delete (window as unknown as { nostr?: object }).nostr
})

const renderPage = () =>
  render(
    <SignerProvider creatorKey={owner}>
      <ModerationPage state={state} />
    </SignerProvider>
  )

it('mutes a comment author with a signed list built on the current one', async () => {
  renderPage()
  const commentRow = (await screen.findByText('buy my coin')).closest('li') as HTMLElement
  expect(within(commentRow).getByText(/on My clip/)).toBeTruthy()

  // The comment's own row and the report row on the same comment both offer "Mute author"
  // for the same spammer; the comment row is the one under test here.
  fireEvent.click(within(commentRow).getByRole('button', { name: 'Mute author' }))
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
  // The comment row, its report row, and the mute list itself all offer the way back.
  expect(await screen.findAllByRole('button', { name: 'Unmute author' })).toHaveLength(3)
})

it('refuses to publish when the extension holds another key than the creator key', async () => {
  const other = generateSecretKey()
  // jsdom's Window has no NIP-07 extension declaration; install the other key's extension.
  const extensionWindow = window as unknown as { nostr: object }
  extensionWindow.nostr = {
    getPublicKey: async () => getPublicKey(other),
    signEvent: async (template: EventTemplate) =>
      JSON.parse(JSON.stringify(finalizeEvent(template, other))),
  }
  renderPage()
  const commentRow = (await screen.findByText('buy my coin')).closest('li') as HTMLElement
  fireEvent.click(within(commentRow).getByRole('button', { name: 'Mute author' }))
  expect(
    await screen.findByText(/uses a different key than this instance's creator key/)
  ).toBeTruthy()
  expect(publish).not.toHaveBeenCalled()
})

it('resolves each report to its video, comment or account, with no mute action on a video report', async () => {
  renderPage()
  // Two video reports: one by e tag, one by a bare x (the BUD-09 bridge's fallback) — both
  // resolve to the same video, so distinguish them by reason.
  const videoRows = (await screen.findAllByText('Reported video: My clip')).map(
    el => el.closest('li') as HTMLElement
  )
  expect(videoRows).toHaveLength(2)
  for (const row of videoRows) {
    expect(within(row).getByText(/one of your own videos/)).toBeTruthy()
    expect(within(row).queryByRole('button')).toBeNull()
  }
  expect(videoRows.some(row => within(row).queryByText(/Reason: illegal/))).toBe(true)
  expect(videoRows.some(row => within(row).queryByText(/Reason: malware/))).toBe(true)

  const commentReportRow = (await screen.findByText('Reported comment')).closest(
    'li'
  ) as HTMLElement
  expect(within(commentReportRow).getByText(/Reason: spam/)).toBeTruthy()
  expect(within(commentReportRow).getByRole('button', { name: 'Mute author' })).toBeTruthy()
  expect(within(commentReportRow).getByRole('button', { name: 'Mute this comment' })).toBeTruthy()

  // A profile report against the creator's own key offers nothing to mute.
  const profileRow = (await screen.findByText('Reported account')).closest('li') as HTMLElement
  expect(within(profileRow).getByText(/Reason: harassment/)).toBeTruthy()
  expect(within(profileRow).queryByRole('button')).toBeNull()
})
