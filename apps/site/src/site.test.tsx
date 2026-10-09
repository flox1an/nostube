import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NostubeClient } from '@nostube/core/client'
import { getInstanceConfig, setInstanceConfig } from '@nostube/core/instance-config'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { loadSiteConfig } from './site-config'
import { SiteHome } from './SiteHome'

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
    eventStore: new EventStore(),
    getTimelineLoader: () => () => of(video),
    relayPool: {
      request: (_relays: string[], filters: { kinds?: number[] }[]) =>
        of(filters[0].kinds?.includes(10063) ? serverList : profile),
    },
  } as unknown as NostubeClient

  it('shows the creator and the creator videos', async () => {
    render(<SiteHome client={client} config={config} />)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeTruthy()
  })

  describe('age gate', () => {
    const nsfw = {
      ...video,
      id: 'd'.repeat(64),
      tags: [...video.tags, ['content-warning', 'nudity']],
    }
    const gatedClient = {
      eventStore: new EventStore(),
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
      render(<SiteHome client={gatedClient} config={config} />)
      await waitFor(() => expect(screen.getByText('Content warning')).toBeTruthy())
      expect(screen.queryByText('My first upload')).toBeTruthy()

      fireEvent.click(screen.getByText('My first upload'))
      expect(screen.getByRole('alertdialog')).toBeTruthy()
      expect(screen.queryByTestId('player')).toBeNull()

      fireEvent.click(screen.getByText('I am 18 or older'))
      expect(localStorage.getItem('nostube-site:age-confirmed')).toBe('true')
      // The player still gets the warning, so it asks before it plays.
      expect(screen.getByTestId('player').getAttribute('data-warning')).toBe('nudity')
      expect(screen.queryByText('Content warning')).toBeNull()
    })

    it('keeps the video locked when the viewer cancels', async () => {
      render(<SiteHome client={gatedClient} config={config} />)
      await waitFor(() => expect(screen.getByText('Content warning')).toBeTruthy())
      fireEvent.click(screen.getByText('My first upload'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(screen.queryByTestId('player')).toBeNull()
      expect(localStorage.getItem('nostube-site:age-confirmed')).toBeNull()
    })

    it('does not ask again once confirmed in this browser', async () => {
      localStorage.setItem('nostube-site:age-confirmed', 'true')
      render(<SiteHome client={gatedClient} config={config} />)
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      fireEvent.click(screen.getByText('My first upload'))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(screen.getByTestId('player').getAttribute('data-warning')).toBe('nudity')
    })
  })
})
