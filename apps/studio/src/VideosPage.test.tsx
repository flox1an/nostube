import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { TimelineProvider } from '@nostube/widgets/timeline'
import { DEFAULT_PROFILE_RELAYS, DEFAULT_SITE_LINKS } from '@nostube/core/instance-config'
import { processEvent } from '@nostube/core/video-event'
import { finalizeEvent, generateSecretKey, type Filter, type NostrEvent } from 'nostr-tools'
import { of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminConfig } from './api'
import { App } from './App'
import { fakeAdminApi, refusal } from './test-admin-api'
import './i18n'

const key = generateSecretKey()
const makeEvent = (d: string, title: string) =>
  finalizeEvent(
    {
      kind: 34235,
      created_at: 100,
      content: '',
      tags: [
        ['d', d],
        ['title', title],
        ['imeta', 'url https://media.example/a.mp4', 'm video/mp4'],
      ],
    },
    key
  )
const makeVideo = (d: string, title: string) => processEvent(makeEvent(d, title), [])!
const video = makeVideo('intro', 'Intro')

const config: AdminConfig = {
  title: 'Flox',
  creators: [video.pubkey],
  allowedWriters: [video.pubkey],
  videoSources: ['wss://relay.example'],
  interactionRelays: [],
  profileRelays: DEFAULT_PROFILE_RELAYS,
  signerRelays: [],
  reach: 'private',
  siteHosting: 'instance',
  nsite: { gateway: 'nsite.lol', domain: '' },
  mirror: { relays: [], blossom: [] },
  search: { mode: 'off' },
  storage: { quotaGib: 0, freeSpaceReserveGib: 5, s3: null },
  site: {
    tagline: 'Hi',
    theme: { accent: '#6d28d9', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: { about: {}, imprint: {}, privacy: {} },
  },
}

/** The instance: this config, nothing scheduled, and `save` as the answer to saving. */
const serve = (save: unknown = { revision: 2, restart: false }) =>
  fakeAdminApi({
    'GET /api/admin/config': {
      revision: 1,
      origin: 'https://site.example',
      tls: '',
      tlsMode: 'proxy',
      bootId: 'boot',
      nostrPubkey: null,
      canBePublic: true,
      originIsPublic: true,
      config,
      branding: { logo: null, favicon: null, banner: null, icon: null },
    },
    'PUT /api/admin/config': save,
    'GET /api/admin/schedule': { items: [] },
  })
vi.mock('./signer-context', () => ({
  SignerProvider: ({ children }: { children: ReactNode }) => children,
  useSigner: () => ({ status: 'none', mode: 'none', signer: null, pubkey: null }),
}))
/** What the instance relay answers to a search, best match first. */
const relay = vi.hoisted(() => ({
  answer: [] as NostrEvent[],
  searches: [] as Filter[],
}))
// `of` is read when the studio boots, after the static imports are in.
vi.mock('./instance-client', () => ({
  bootInstanceClient: async () => ({
    config: { startPage: { kind: 'creator-profile', creator: 'creator' }, videoSources: [] },
    client: {
      eventStore: { add: (event: unknown) => event },
      searchVideos: (filter: Filter) => {
        relay.searches.push(filter)
        return of(...relay.answer)
      },
    },
  }),
}))
// Renders lazily, after the static imports are in.
vi.mock('@nostube/widgets/instance-providers', () => ({
  InstanceProviders: ({ client, children }: { client: never; children: ReactNode }) => (
    <TooltipProvider>
      <TimelineProvider value={{ client, policy: { getAllMissingVideos: () => ({}) } }}>
        {children}
      </TimelineProvider>
    </TooltipProvider>
  ),
}))
const videos = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('@nostube/widgets/hooks/useCreatorVideos', () => ({
  useCreatorVideos: () => ({ videos: videos.list, loading: false, error: null, hasMore: false }),
}))

beforeEach(() => {
  location.hash = '#/videos'
  videos.list = [video]
  relay.answer = []
  relay.searches = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('studio videos page', () => {
  it('saves hiding at once, without a save bar, and keeps the other pages in step', async () => {
    const { sent } = serve()
    render(<App />)
    const more = await screen.findByRole('button', { name: 'More actions' })
    expect(screen.getByRole('link', { name: 'Upload' }).getAttribute('href')).toBe('#/upload')
    expect(screen.queryByRole('button', { name: 'Save and apply' })).toBeNull()

    fireEvent.keyDown(more, { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide on site' }))
    await screen.findByText('Hidden')
    const ref = `34235:${video.pubkey}:intro`
    expect(sent('PUT /api/admin/config')).toEqual([
      { ...config, site: { ...config.site, videos: { hidden: [ref] } } },
    ])

    // The saved hidden list is the new baseline: another page has nothing pending (no save bar).
    act(() => {
      location.hash = '#/appearance'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByRole('button', { name: 'Appearance', current: 'page' })
    expect(screen.queryByRole('button', { name: 'Save and apply' })).toBeNull()
  })

  it('keeps the video shown and says why when saving fails', async () => {
    serve(refusal(500, 'server said no'))
    render(<App />)
    fireEvent.keyDown(await screen.findByRole('button', { name: 'More actions' }), {
      key: 'Enter',
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide on site' }))
    expect((await screen.findByRole('alert')).textContent).toBe('server said no')
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it("searches the instance relay and keeps the relay's ranking", async () => {
    const [cats, catTricks] = [makeEvent('cats', 'Cats'), makeEvent('tricks', 'Cat tricks')]
    videos.list = [makeVideo('dogs', 'Dogs'), processEvent(cats, [])!]
    relay.answer = [catTricks, cats]
    serve()
    render(<App />)
    // Few videos loaded, but more may match on the relay: the box is always there.
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search videos' }), {
      target: { value: 'CAT' },
    })
    await waitFor(() =>
      expect(screen.getAllByText(/^Cat/).map(e => e.textContent)).toEqual(['Cat tricks', 'Cats'])
    )
    expect(screen.queryByText('Dogs')).toBeNull()
    expect(relay.searches).toEqual([
      { kinds: [34235, 34236, 21, 22], authors: ['creator'], search: 'CAT', limit: 50 },
    ])
  })

  it('offers an upload when there are no videos yet', async () => {
    videos.list = []
    serve()
    render(<App />)
    expect(await screen.findByText('No videos yet')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Upload' })).toHaveLength(2)
  })
})
