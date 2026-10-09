import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { nip19 } from 'nostr-tools'
import { MemoryRouter } from 'react-router-dom'
import { of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NostubeClient } from '@nostube/core/client'
import { getInstanceConfig, setInstanceConfig } from '@nostube/core/instance-config'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { loadSiteConfig } from './site-config'
import { SiteHome } from './SiteHome'
import { applyTheme, readableOn } from './theme'

// The real player needs a browser; the gate tests only need to see what it is given.
vi.mock('@nostube/widgets/player', () => ({
  VideoPlayer: (props: { contentWarning?: string }) => (
    <div data-testid="player" data-warning={props.contentWarning ?? ''} />
  ),
}))

const creator = 'c'.repeat(64)
const config: InstanceConfig = {
  version: 1,
  revision: 1,
  origin: 'https://site.example',
  title: 'Site title',
  creators: [creator],
  startPage: { kind: 'creator-profile', creator },
  videoSources: ['wss://videos.example'],
  interactionRelays: ['wss://interact.example'],
  search: { mode: 'off' },
  site: { tagline: '', theme: { accent: '#6d28d9', font: 'sans' }, videos: { hidden: [] } },
}

// The fake events carry no valid signature, so the store must not verify them.
function makeStore() {
  const store = new EventStore()
  store.verifyEvent = () => true
  return store
}

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

afterEach(() => {
  setInstanceConfig(null as unknown as InstanceConfig)
})

describe('loadSiteConfig', () => {
  it('validates the config and registers it', async () => {
    const loaded = await loadSiteConfig(() => jsonResponse(config))
    expect(loaded.title).toBe('Site title')
    expect(getInstanceConfig()).toEqual(loaded)
  })

  it('rejects an invalid config and registers nothing', async () => {
    await expect(
      loadSiteConfig(() => jsonResponse({ ...config, creators: ['nope'] }))
    ).rejects.toThrow(/creators must be a list of hex pubkeys/)
    expect(getInstanceConfig()).toBeNull()
  })

  it('reports a server error with its status', async () => {
    await expect(loadSiteConfig(() => jsonResponse({ error: 'down' }, 503))).rejects.toThrow(/503/)
  })
})

function renderSite(client: NostubeClient, path = '/', siteConfig: InstanceConfig = config) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteHome client={client} config={siteConfig} />
    </MemoryRouter>
  )
}

describe('SiteHome', () => {
  const video = {
    id: 'e'.repeat(64),
    kind: 21,
    pubkey: creator,
    created_at: 1_700_000_000,
    content: 'A first video',
    sig: 'f'.repeat(128),
    tags: [
      ['title', 'My first upload'],
      ['imeta', 'url https://media.example/a.mp4', 'm video/mp4', 'duration 61'],
    ],
  }
  const profile = {
    id: '1'.repeat(64),
    kind: 0,
    pubkey: creator,
    created_at: 1_699_000_000,
    content: JSON.stringify({ name: 'Alice' }),
    sig: '2'.repeat(128),
    tags: [],
  }
  const serverList = {
    id: '3'.repeat(64),
    kind: 10063,
    pubkey: creator,
    created_at: 1_699_000_000,
    content: '',
    sig: '4'.repeat(128),
    tags: [['server', 'https://blossom.example/']],
  }
  const client = {
    eventStore: makeStore(),
    getTimelineLoader: () => () => of(video),
    relayPool: {
      request: (_relays: string[], filters: { kinds?: number[] }[]) =>
        of(filters[0].kinds?.includes(10063) ? serverList : profile),
    },
  } as unknown as NostubeClient

  it('shows the site title and the creator videos', async () => {
    renderSite(client)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Site title' })).toBeTruthy()
  })

  it('shows the configured title and tagline, not the profile name', async () => {
    renderSite(client, '/', { ...config, site: { ...config.site, tagline: 'Fresh every week' } })
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Site title' })).toBeTruthy()
    expect(screen.getByText('Fresh every week')).toBeTruthy()
  })

  it('leaves out hidden videos in the grid and on their own page', async () => {
    const hidden = { ...config, site: { ...config.site, videos: { hidden: [video.id] } } }
    renderSite(client, '/', hidden)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Site title' })).toBeTruthy())
    expect(screen.queryByText('My first upload')).toBeNull()
  })

  it('does not open a hidden video from a direct link either', async () => {
    const hidden = { ...config, site: { ...config.site, videos: { hidden: [video.id] } } }
    renderSite(client, `/v/${nip19.neventEncode({ id: video.id, author: creator })}`, hidden)
    await waitFor(() => expect(screen.getByText('Video not found.')).toBeTruthy())
    expect(screen.queryByTestId('player')).toBeNull()
  })

  it('opens a video at its own URL and opens it directly from a link', async () => {
    renderSite(client)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    fireEvent.click(screen.getByText('My first upload'))
    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'My first upload' })).toBeTruthy()
    fireEvent.click(screen.getByText('← All videos'))
    await waitFor(() => expect(screen.queryByTestId('player')).toBeNull())
  })

  it('reports a video link that is not valid', async () => {
    renderSite(client, '/v/not-a-link')
    await waitFor(() => expect(screen.getByText('This video link is not valid.')).toBeTruthy())
  })

  it('does not open a link to a video of someone else', async () => {
    const foreignAddress = nip19.naddrEncode({
      kind: 34235,
      pubkey: 'b'.repeat(64),
      identifier: 'x',
    })
    renderSite(client, `/v/${foreignAddress}`)
    await waitFor(() => expect(screen.getByText('This video link is not valid.')).toBeTruthy())
  })

  describe('age gate', () => {
    const nsfw = {
      ...video,
      id: 'd'.repeat(64),
      tags: [...video.tags, ['content-warning', 'nudity']],
    }
    const gatedClient = {
      eventStore: makeStore(),
      getTimelineLoader: () => () => of(nsfw),
      relayPool: { request: () => of(profile) },
    } as unknown as NostubeClient

    // Node's experimental global localStorage shadows jsdom's; use a plain in-memory store.
    beforeEach(() => {
      const store = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('locks a video with a content warning until 18+ is confirmed', async () => {
      renderSite(gatedClient)
      await waitFor(() => expect(screen.getByText('Content warning')).toBeTruthy())
      expect(screen.queryByText('My first upload')).toBeTruthy()

      fireEvent.click(screen.getByText('My first upload'))
      expect(screen.getByRole('alertdialog')).toBeTruthy()
      expect(screen.queryByTestId('player')).toBeNull()

      fireEvent.click(screen.getByText('I am 18 or older'))
      expect(localStorage.getItem('nostube-site:age-confirmed')).toBe('true')
      // The player still gets the warning, so it asks before it plays.
      await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
      expect(screen.getByTestId('player').getAttribute('data-warning')).toBe('nudity')
    })

    it('asks for 18+ on a direct link to a locked video', async () => {
      const link = nip19.neventEncode({ id: nsfw.id, author: creator })
      renderSite(gatedClient, `/v/${link}`)
      await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy())
      expect(screen.queryByTestId('player')).toBeNull()
      fireEvent.click(screen.getByText('I am 18 or older'))
      await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
    })

    it('keeps the video locked when the viewer cancels', async () => {
      renderSite(gatedClient)
      await waitFor(() => expect(screen.getByText('Content warning')).toBeTruthy())
      fireEvent.click(screen.getByText('My first upload'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(screen.queryByTestId('player')).toBeNull()
      expect(localStorage.getItem('nostube-site:age-confirmed')).toBeNull()
    })

    it('does not ask again once confirmed in this browser', async () => {
      localStorage.setItem('nostube-site:age-confirmed', 'true')
      renderSite(gatedClient)
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      fireEvent.click(screen.getByText('My first upload'))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
      expect(screen.getByTestId('player').getAttribute('data-warning')).toBe('nudity')
    })
  })
})

describe('theme', () => {
  it('sets the accent, a readable text colour and the font on the root', () => {
    const root = document.createElement('div')
    applyTheme(
      { tagline: '', theme: { accent: '#ffcc00', font: 'serif' }, videos: { hidden: [] } },
      root
    )
    expect(root.style.getPropertyValue('--primary')).toBe('#ffcc00')
    expect(root.style.getPropertyValue('--primary-foreground')).toBe('#111111')
    expect(root.style.getPropertyValue('--accent')).toBe('')
    expect(root.style.fontFamily).toContain('Georgia')
  })

  it('picks white text on dark colours and dark text on light ones', () => {
    expect(readableOn('#1a1a8c')).toBe('#ffffff')
    expect(readableOn('#f5f5dc')).toBe('#111111')
    // Mid tones read better with dark text (white on #00aa55 would be about 3:1).
    expect(readableOn('#00aa55')).toBe('#111111')
    expect(readableOn('#f97316')).toBe('#111111')
    expect(readableOn('#e11d48')).toBe('#ffffff')
  })
})
