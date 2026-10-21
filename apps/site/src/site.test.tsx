import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { AccountManager } from 'applesauce-accounts'
import { nip19, type Filter, type NostrEvent } from 'nostr-tools'
import { MemoryRouter } from 'react-router-dom'
import { EMPTY, NEVER, of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NostubeClient } from '@nostube/core/client'
import {
  getInstanceConfig,
  loadInstanceConfig,
  setInstanceConfig,
  type InstanceConfig,
} from '@nostube/core/instance-config'
import { browserLanguage } from './i18n'
import i18n from './i18n'
import { SiteHome } from './SiteHome'
import { applyTheme, readableOn } from '@nostube/widgets/site-theme'
import { startInstallPromptCapture } from '@nostube/widgets/install-prompt'

// The real player needs a browser; the gate tests only need to see what it is given.
vi.mock('@nostube/widgets/player', () => ({
  VideoPlayer: (props: {
    contentWarning?: string
    initialPlayPos?: number
    onTimeUpdate?: (time: number) => void
    onEnded?: () => void
    onAllSourcesFailed?: (urls: string[]) => void
    onVideoElementReady?: (element: HTMLMediaElement | null) => void
  }) => (
    <>
      <video
        ref={props.onVideoElementReady}
        data-testid="player"
        data-warning={props.contentWarning ?? ''}
        data-start={props.initialPlayPos ?? 0}
        onTimeUpdate={event => props.onTimeUpdate?.(event.currentTarget.currentTime)}
        onEnded={props.onEnded}
      />
      {/* Stands in for "every source failed": hidden from the accessibility tree. */}
      <button hidden data-testid="player-fail" onClick={() => props.onAllSourcesFailed?.([])} />
    </>
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
  profileRelays: [],
  search: { mode: 'off' },
  site: {
    tagline: '',
    theme: { accent: '#6d28d9', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: noSitePages(),
  },
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

describe('loadInstanceConfig', () => {
  it('validates the config and registers it', async () => {
    const loaded = await loadInstanceConfig(() => jsonResponse(config))
    expect(loaded.title).toBe('Site title')
    expect(getInstanceConfig()).toEqual(loaded)
  })

  it('rejects an invalid config and registers nothing', async () => {
    await expect(
      loadInstanceConfig(() => jsonResponse({ ...config, creators: ['nope'] }))
    ).rejects.toThrow(/creators must be a list of hex pubkeys/)
    expect(getInstanceConfig()).toBeNull()
  })

  it('reports a server error with its status', async () => {
    await expect(loadInstanceConfig(() => jsonResponse({ error: 'down' }, 503))).rejects.toThrow(
      /503/
    )
  })

  it('takes the config the server put into the page, validated, without a request', async () => {
    const inline = document.createElement('script')
    inline.type = 'application/json'
    inline.id = 'nostube-config'
    inline.textContent = JSON.stringify(config)
    document.head.append(inline)
    const fetchImpl = vi.fn()
    try {
      const loaded = await loadInstanceConfig(fetchImpl)
      expect(loaded.title).toBe('Site title')
      expect(getInstanceConfig()).toEqual(loaded)
      expect(fetchImpl).not.toHaveBeenCalled()
      inline.textContent = JSON.stringify({ ...config, creators: ['nope'] })
      await expect(loadInstanceConfig(fetchImpl)).rejects.toThrow(/creators must be a list/)
    } finally {
      inline.remove()
    }
  })
})

function renderSite(client: NostubeClient, path = '/', siteConfig: InstanceConfig = config) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteHome client={client} config={siteConfig} accountManager={new AccountManager()} />
    </MemoryRouter>
  )
}

describe('SiteHome', () => {
  // Node's experimental global storage shadows jsdom's; use plain in-memory stores.
  beforeEach(() => {
    for (const name of ['localStorage', 'sessionStorage']) {
      const store = new Map<string, string>()
      vi.stubGlobal(name, {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
      })
    }
  })
  afterEach(() => vi.unstubAllGlobals())
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
      subscription: () => NEVER,
      request: (_relays: string[], filters: { kinds?: number[] }[]) =>
        of(filters[0].kinds?.includes(10063) ? serverList : profile),
    },
  } as unknown as NostubeClient

  it('shows the site title and the creator videos', async () => {
    renderSite(client)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Site title' })).toBeTruthy()
  })

  it('resolves older editorial choices independently and keeps the creator’s selected order', async () => {
    const film = (id: string, identifier: string, title: string, age: number) => ({
      pubkey: creator,
      content: 'A film',
      sig: 'f'.repeat(128),
      id: id.repeat(64),
      kind: 34235,
      created_at: video.created_at - age,
      tags: [
        ['d', identifier],
        ['title', title],
        ['imeta', 'url https://media.example/film.mp4', 'm video/mp4'],
      ],
    })
    const debut = film('8', 'debut:cut', 'The debut film', 50)
    const backstage = film('9', 'backstage', 'Behind the scenes', 100)
    const curatedClient = {
      ...client,
      eventStore: makeStore(),
      getTimelineLoader: (_key: string, filters: Filter) => () =>
        of(...(filters['#d'] ? [debut, backstage] : [video])),
    } as unknown as NostubeClient
    renderSite(curatedClient, '/', {
      ...config,
      site: {
        ...config.site,
        homepage: {
          intro: 'Independent films by Alice.',
          featured: `34235:${creator}:debut:cut`,
          featuredText: 'My first story.',
          selected: [`34235:${creator}:backstage`, `34235:${creator}:debut:cut`],
          links: [{ label: 'Concerts', url: 'https://alice.example/concerts' }],
          action: { label: 'Book a screening', url: 'https://alice.example/contact' },
        },
      },
    })
    expect(await screen.findByRole('heading', { name: 'The debut film' })).toBeTruthy()
    const selected = await screen.findByRole('region', { name: 'Selected works' })
    const recommendations = within(selected).getAllByRole('link')
    expect(recommendations[0].textContent).toContain('Behind the scenes')
    expect(recommendations[1].textContent).toContain('The debut film')
    expect(screen.getByRole('link', { name: 'Book a screening' }).getAttribute('href')).toBe(
      'https://alice.example/contact'
    )
    expect(screen.getByText('Independent films by Alice.')).toBeTruthy()
    expect(screen.getByText('My first story.')).toBeTruthy()
    expect(screen.getByText('My first upload')).toBeTruthy()
  })

  it('omits hidden and foreign editorial choices and keeps warned artwork behind the age gate', async () => {
    // EventStore attaches cached tag/identifier symbols; never spread an already indexed event.
    const base = {
      kind: 21,
      pubkey: creator,
      created_at: video.created_at,
      content: 'A film',
      sig: 'f'.repeat(128),
    }
    const hidden = {
      ...base,
      id: '8'.repeat(64),
      tags: [['title', 'Hidden film'], ...video.tags.slice(1)],
    }
    const foreign = {
      ...base,
      id: '9'.repeat(64),
      pubkey: 'd'.repeat(64),
      tags: [['title', 'Foreign film'], ...video.tags.slice(1)],
    }
    const warned = {
      ...base,
      id: '7'.repeat(64),
      tags: [
        ['title', 'Warned film'],
        ['content-warning', 'Sensitive'],
        [
          'imeta',
          'url https://media.example/warned.mp4',
          'm video/mp4',
          'image https://media.example/sensitive.jpg',
        ],
      ],
    }
    renderSite(
      {
        ...client,
        eventStore: makeStore(),
        getTimelineLoader: () => () => of(hidden, foreign, warned),
      } as unknown as NostubeClient,
      '/',
      {
        ...config,
        site: {
          ...config.site,
          videos: { hidden: [hidden.id] },
          homepage: {
            intro: '',
            featured: warned.id,
            featuredText: 'Sensitive editorial note',
            selected: [hidden.id, foreign.id],
            links: [],
            action: null,
          },
        },
      }
    )
    expect(await screen.findByRole('heading', { name: 'Warned film' })).toBeTruthy()
    expect(screen.queryByText('Hidden film')).toBeNull()
    expect(screen.queryByText('Foreign film')).toBeNull()
    expect(screen.queryByText('Sensitive editorial note')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Selected works' })).toBeNull()
    expect([...document.querySelectorAll('img')].map(image => image.src)).not.toContain(
      'https://media.example/sensitive.jpg'
    )
  })

  it('shows the configured title and tagline, not the profile name', async () => {
    renderSite(client, '/', { ...config, site: { ...config.site, tagline: 'Fresh every week' } })
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Site title' })).toBeTruthy()
    expect(screen.getByText('Fresh every week')).toBeTruthy()
  })

  describe('pages', () => {
    const withPages = {
      ...config,
      site: {
        ...config.site,
        pages: {
          about: { en: 'We make videos.\nVisit https://example.org', de: 'Wir machen Videos.' },
          imprint: { de: 'Impressum von Alice' },
          privacy: {},
        },
      },
    }

    it('links only the pages that have a text, and opens one at its own URL', async () => {
      renderSite(client, '/', withPages)
      const footer = await screen.findByRole('navigation', { name: 'Information' })
      expect([...footer.querySelectorAll('a')].map(a => a.textContent)).toEqual([
        'About',
        'Imprint',
      ])
      fireEvent.click(screen.getByRole('link', { name: 'Imprint' }))
      // Not written in English: the first language by code stands in.
      expect(await screen.findByText('Impressum von Alice')).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Imprint' })).toBeTruthy()
    })

    it('shows the text and the labels in the visitor’s language', async () => {
      await i18n.changeLanguage('de')
      try {
        renderSite(client, '/about', withPages)
        expect(await screen.findByText('Wir machen Videos.')).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Über uns' })).toBeTruthy()
        expect(screen.getByRole('link', { name: 'Impressum' })).toBeTruthy()
      } finally {
        await i18n.changeLanguage('en')
      }
    })

    it('has no footer without pages, and sends a page without text back to the start', async () => {
      const { unmount } = renderSite(client)
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      expect(screen.queryByRole('navigation', { name: 'Information' })).toBeNull()
      unmount()

      renderSite(client, '/privacy', withPages)
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      expect(screen.queryByRole('heading', { name: 'Privacy policy' })).toBeNull()
    })

    it('offers installing the app in the footer once the browser can', async () => {
      startInstallPromptCapture()
      const { unmount } = renderSite(client)
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull()
      unmount()

      const prompt = vi.fn(() => Promise.resolve())
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }))
      renderSite(client)
      fireEvent.click(await screen.findByRole('button', { name: 'Install app' }))
      expect(prompt).toHaveBeenCalledOnce()
      // The prompt can be used once: the entry goes away.
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull())
    })
  })

  it('shows the instance logo instead of the creator picture, in the header and the breadcrumb', async () => {
    const picture = 'https://media.example/alice.jpg'
    const pictured = { ...profile, content: JSON.stringify({ name: 'Alice', picture }) }
    const picturedClient = {
      ...client,
      eventStore: makeStore(),
      relayPool: {
        ...client.relayPool,
        request: (_relays: string[], filters: { kinds?: number[] }[]) =>
          of(filters[0].kinds?.includes(10063) ? serverList : pictured),
      },
    } as unknown as NostubeClient
    const images = () => [...document.querySelectorAll('img')].map(img => img.getAttribute('src'))
    const { unmount } = renderSite(picturedClient)
    await waitFor(() => expect(images()).toContain(picture))
    unmount()

    const logo = '/branding/logo?v=1'
    const banner = '/branding/banner?v=2'
    renderSite(picturedClient, '/', { ...config, site: { ...config.site, logo, banner } })
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(images()).toEqual(expect.arrayContaining([logo, banner]))
    expect(images()).not.toContain(picture)
    fireEvent.click(screen.getByText('My first upload'))
    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(crumb.querySelector('img')?.getAttribute('src')).toBe(logo)
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
    // A real link (new tab, copy link, crawlers); a plain click stays in the app.
    const card = screen.getByText('My first upload').closest('a')!
    expect(card.getAttribute('href')).toMatch(/^\/v\/nevent1/)
    fireEvent.click(card)
    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'My first upload' })).toBeTruthy()
    const crumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    fireEvent.click(within(crumb).getByRole('link', { name: 'Site title' }))
    await waitFor(() => expect(screen.queryByTestId('player')).toBeNull())
  })

  it('lists the videos with a tag at /t/<tag>, reached from a tag on a video page', async () => {
    // Fresh copies: the store of an earlier test marked `video` with its own (symbol) caches.
    const fresh = (): typeof video => JSON.parse(JSON.stringify(video))
    const tagged = { ...fresh(), tags: [...video.tags, ['t', 'travel']] }
    const untagged = {
      ...fresh(),
      id: 'd'.repeat(64),
      tags: [
        ['title', 'Untagged'],
        ['imeta', 'url https://media.example/b.mp4', 'm video/mp4', 'duration 30'],
      ],
    }
    const taggedClient = {
      eventStore: makeStore(),
      getTimelineLoader: () => () => of(tagged, untagged),
      relayPool: { request: () => of(profile), subscription: () => NEVER },
    } as unknown as NostubeClient
    renderSite(taggedClient)
    await waitFor(() => expect(screen.getByText('Untagged')).toBeTruthy())
    fireEvent.click(screen.getByText('My first upload'))
    // The video page leads on: the creator's other videos below it.
    const more = await screen.findByRole('heading', { name: 'More videos' })
    expect(more.parentElement?.textContent).toContain('Untagged')
    fireEvent.click(screen.getByRole('link', { name: '#travel' }))
    expect(await screen.findByRole('heading', { name: 'Videos tagged #travel' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    expect(screen.queryByText('Untagged')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'All videos' }))
    await waitFor(() => expect(screen.getByText('Untagged')).toBeTruthy())
  })

  describe('search', () => {
    const fresh = (): typeof video => JSON.parse(JSON.stringify(video))
    const cafe = {
      ...fresh(),
      id: 'd'.repeat(64),
      content: 'Morning coffee by the river',
      tags: [
        ['title', 'Café in Lisbon'],
        ['t', 'travel'],
        ['imeta', 'url https://media.example/b.mp4', 'm video/mp4', 'duration 30'],
      ],
    }
    const secret = {
      ...fresh(),
      id: 'a'.repeat(64),
      tags: [
        ['title', 'Secret cafe'],
        ['imeta', 'url https://media.example/c.mp4', 'm video/mp4', 'duration 30'],
      ],
    }
    const gated = {
      ...fresh(),
      id: 'b'.repeat(64),
      content: 'Cafe after dark',
      tags: [
        ['title', 'Night shift'],
        ['content-warning', 'nudity'],
        ['imeta', 'url https://media.example/d.mp4', 'm video/mp4', 'duration 30'],
      ],
    }
    // Two pages, then nothing: a match on the second page is found too. The pages complete
    // synchronously (like a cache), so a page starts and ends within one render batch: paging
    // must not wait for a loading flag to flip, or it stops after the first page.
    const pagedClient = () =>
      ({
        eventStore: makeStore(),
        getTimelineLoader: () => {
          const pages = [[fresh()], [cafe, secret, gated]]
          return () => {
            const page = pages.shift()
            return page ? of(...page) : EMPTY
          }
        },
        relayPool: { request: () => of(profile), subscription: () => NEVER },
      }) as unknown as NostubeClient
    const local: InstanceConfig = {
      ...config,
      search: { mode: 'local' },
      site: { ...config.site, videos: { hidden: [secret.id] } },
    }

    it('has no search box and no search page when search is off', async () => {
      renderSite(pagedClient(), '/search?q=cafe')
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      expect(screen.queryByRole('search')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Search videos' })).toBeNull()
      expect(screen.queryByText(/Search results/)).toBeNull()
    })

    it('finds the shown videos by description words, ignoring case and accents', async () => {
      renderSite(pagedClient(), '/', local)
      await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
      // Folded into an icon until clicked; an empty box folds back on Escape, focus on the icon.
      expect(screen.queryByRole('searchbox')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Search videos' }))
      expect(document.activeElement).toBe(screen.getByRole('searchbox'))
      fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
      expect(screen.queryByRole('searchbox')).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search videos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Search videos' }))
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search videos' }), {
        target: { value: '  COFFEE cafe ' },
      })
      fireEvent.submit(screen.getByRole('search'))
      expect(
        await screen.findByRole('heading', { name: 'Search results for “COFFEE cafe”' })
      ).toBeTruthy()
      await waitFor(() => expect(screen.getByText('Café in Lisbon')).toBeTruthy())
      expect(screen.queryByText('My first upload')).toBeNull()
      // Hidden by the creator: never found.
      expect(screen.queryByText('Secret cafe')).toBeNull()
      // Locked: only its title is searched, and "cafe" is in its description only.
      expect(screen.queryByText('Night shift')).toBeNull()
      expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('COFFEE cafe')
    })

    it('says so when nothing matches, and finds a locked video by its title', async () => {
      const { unmount } = renderSite(pagedClient(), '/search?q=nothing%20like%20this', local)
      expect(await screen.findByText('No video matches “nothing like this”.')).toBeTruthy()
      unmount()
      renderSite(pagedClient(), '/search?q=night', local)
      await waitFor(() => expect(screen.getByText('Night shift')).toBeTruthy())
      expect(screen.getByText('Content warning')).toBeTruthy()
    })
  })

  it('shows placeholders while the videos load', async () => {
    const pending = {
      eventStore: makeStore(),
      getTimelineLoader: () => () => NEVER,
      relayPool: { request: () => NEVER, subscription: () => NEVER },
    } as unknown as NostubeClient
    renderSite(pending)
    const placeholders = await screen.findByLabelText('Loading videos')
    expect(placeholders.getAttribute('aria-busy')).toBe('true')
  })

  it('shows date, tags and a share dialog with the canonical link on a video page', async () => {
    const tagged = {
      ...video,
      tags: [...video.tags, ['t', 'travel']],
    }
    const taggedClient = {
      eventStore: makeStore(),
      getTimelineLoader: () => () => of(tagged),
      relayPool: { request: () => of(profile), subscription: () => NEVER },
    } as unknown as NostubeClient
    renderSite(taggedClient)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    fireEvent.click(screen.getByText('My first upload'))
    await waitFor(() => expect(screen.getByText('#travel')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Share this video' }))
    const link = await screen.findByDisplayValue(/^https:\/\/site\.example\/v\/nevent1/)
    expect(link).toBeTruthy()
  })

  it('shares a frozen play position in the link and embed only when requested', async () => {
    renderSite(client, `/v/${nip19.neventEncode({ id: video.id, author: creator })}`)
    const player = (await screen.findByTestId('player')) as HTMLVideoElement
    player.currentTime = 83.9
    fireEvent.timeUpdate(player)
    fireEvent.click(screen.getByRole('button', { name: 'Share this video' }))
    const timestamp = await screen.findByRole('checkbox', { name: 'Include current timestamp' })
    const link = screen.getByDisplayValue(
      /^https:\/\/site\.example\/v\/nevent1/
    ) as HTMLInputElement
    expect(new URL(link.value).searchParams.has('t')).toBe(false)
    fireEvent.click(timestamp)
    expect(new URL(link.value).searchParams.get('t')).toBe('83')
    player.currentTime = 95
    fireEvent.timeUpdate(player)
    expect(new URL(link.value).searchParams.get('t')).toBe('83')
    fireEvent.click(screen.getByRole('button', { name: 'Embed' }))
    const embed = (await screen.findByLabelText('Embed Code')) as HTMLTextAreaElement
    expect(embed.value).toContain('&t=83')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include current timestamp' }))
    expect(new URL(link.value).searchParams.has('t')).toBe(false)
    expect(embed.value).not.toContain('&t=')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('player')).toBeTruthy()
  })

  it('replaces the site header with a breadcrumb on a video page and leaves it with Esc', async () => {
    renderSite(client)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    fireEvent.click(screen.getByText('My first upload'))
    const crumb = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(crumb.closest('header')).toBeTruthy()
    expect(crumb.textContent).toContain('Site title')
    await waitFor(() => expect(crumb.textContent).toContain('My first upload'))
    // The breadcrumb names the site: no second site title above the video.
    expect(screen.queryByRole('heading', { name: 'Site title' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('player')).toBeNull())
    expect(screen.getByRole('heading', { name: 'Site title' })).toBeTruthy()
  })

  it('does not leave the video page with Esc while typing in a field', async () => {
    renderSite(client)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    fireEvent.click(screen.getByText('My first upload'))
    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
    const input = document.body.appendChild(document.createElement('input'))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByTestId('player')).toBeTruthy()
    input.remove()
  })

  it('renders links, mentions and timestamps in the description', async () => {
    const other = 'b'.repeat(64)
    const described = {
      ...video,
      content: `Watch https://example.com/more at 1:23 with nostr:${nip19.npubEncode(other)} #travel`,
    }
    const describedClient = {
      eventStore: makeStore(),
      getTimelineLoader: () => () => of(described),
      relayPool: { request: () => of(profile), subscription: () => NEVER },
    } as unknown as NostubeClient
    renderSite(describedClient)
    await waitFor(() => expect(screen.getByText('My first upload')).toBeTruthy())
    fireEvent.click(screen.getByText('My first upload'))
    const external = await waitFor(() => {
      const link = screen
        .getAllByRole('link')
        .find(link => link.getAttribute('href') === 'https://example.com/more')
      expect(link).toBeDefined()
      return link!
    })
    expect(external.getAttribute('target')).toBe('_blank')
    expect(external.getAttribute('rel')).toContain('noopener')
    const seek = screen.getByRole('link', { name: '1:23' })
    expect(seek.getAttribute('href')).toMatch(/\/v\/nevent1.*\?t=83$/)
    const mention = screen.getByRole('link', { name: /^@/ })
    // The mention links out as nprofile, naming the instance's relays for profile lookup.
    expect(mention.getAttribute('href')).toBe(
      `https://njump.me/${nip19.nprofileEncode({
        pubkey: other,
        relays: ['wss://interact.example', 'wss://videos.example'],
      })}`
    )
    // Tags open the site's own tag page.
    expect(screen.getByRole('link', { name: '#travel' }).getAttribute('href')).toBe('/t/travel')
  })

  it('starts a long description collapsed and collapses it again on another video', async () => {
    const second = {
      ...video,
      id: '9'.repeat(64),
      content: 'The second description',
      tags: [['title', 'Second upload'], video.tags[1]],
    }
    const first = {
      ...video,
      content: `See nostr:${nip19.neventEncode({ id: second.id, author: creator, kind: 21 })}`,
    }
    const pairClient = {
      eventStore: makeStore(),
      getTimelineLoader: () => () => of(first, second),
      relayPool: { request: () => of(profile), subscription: () => NEVER },
    } as unknown as NostubeClient
    // jsdom has no layout: make every clamped text report more content than fits.
    const overflow = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(100)
    try {
      renderSite(pairClient, `/v/${nip19.neventEncode({ id: first.id, author: creator })}`)
      const more = await screen.findByRole('button', { name: 'More' })
      expect(more.getAttribute('aria-expanded')).toBe('false')
      const region = document.getElementById(more.getAttribute('aria-controls')!)
      expect(region?.textContent).toContain('Video')

      fireEvent.click(more)
      const less = screen.getByRole('button', { name: 'Less' })
      expect(less.getAttribute('aria-expanded')).toBe('true')
      fireEvent.click(less)
      expect(screen.getByRole('button', { name: 'More' }).getAttribute('aria-expanded')).toBe(
        'false'
      )

      fireEvent.click(screen.getByRole('button', { name: 'More' }))
      fireEvent.click(screen.getByRole('link', { name: 'Video' }))
      await screen.findByRole('heading', { name: 'Second upload' })
      const reset = await screen.findByRole('button', { name: 'More' })
      expect(reset.getAttribute('aria-expanded')).toBe('false')
    } finally {
      overflow.mockRestore()
    }
  })

  it('starts a video at the time in the link', async () => {
    const link = nip19.neventEncode({ id: video.id, author: creator })
    renderSite(client, `/v/${link}?t=83`)
    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
    expect(screen.getByTestId('player').getAttribute('data-start')).toBe('83')
  })

  it('starts at 0 without a time or with a bad one', async () => {
    const link = nip19.neventEncode({ id: video.id, author: creator })
    renderSite(client, `/v/${link}?t=abc`)
    await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
    expect(screen.getByTestId('player').getAttribute('data-start')).toBe('0')
  })

  describe('watching', () => {
    const PROGRESS_KEY = 'nostube-site:watch-progress'
    const saved = (time: number) =>
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify([{ ref: video.id, time, duration: 61, updatedAt: Date.now() }])
      )
    const link = nip19.neventEncode({ id: video.id, author: creator })
    // Events built fresh: the event store marks the objects it has indexed.
    const plainVideo = (id: string, title: string, extra: string[][] = []): NostrEvent => ({
      id: id.repeat(64),
      kind: 21,
      pubkey: creator,
      created_at: 1_700_000_000,
      content: '',
      sig: 'f'.repeat(128),
      tags: [
        ['title', title],
        ['imeta', 'url https://media.example/a.mp4', 'm video/mp4', 'duration 120'],
        ...extra,
      ],
    })
    const clientOf = (...events: NostrEvent[]) =>
      ({
        eventStore: makeStore(),
        getTimelineLoader: () => () => of(...events),
        relayPool: { request: () => of(profile), subscription: () => NEVER },
      }) as unknown as NostubeClient
    const tick = (player: HTMLElement, time: number) => {
      Object.defineProperty(player, 'currentTime', {
        value: time,
        writable: true,
        configurable: true,
      })
      fireEvent.timeUpdate(player)
    }

    it('resumes where this device stopped, but a time in the link always wins', async () => {
      saved(40)
      const first = renderSite(client, `/v/${link}`)
      await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
      expect(screen.getByTestId('player').getAttribute('data-start')).toBe('40')
      first.unmount()
      for (const [query, start] of [
        ['?t=12', '12'],
        ['?t=0', '0'],
        ['?t=abc', '40'],
      ]) {
        const view = renderSite(client, `/v/${link}${query}`)
        await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
        expect(screen.getByTestId('player').getAttribute('data-start')).toBe(start)
        view.unmount()
      }
    })

    it('keeps the position while watching, shows it on the start page and clears it there', async () => {
      const view = renderSite(client, `/v/${link}`)
      await waitFor(() => expect(screen.getByTestId('player')).toBeTruthy())
      tick(screen.getByTestId('player'), 30)
      expect(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '[]')).toMatchObject([
        { ref: video.id, time: 30 },
      ])
      view.unmount()

      renderSite(client, '/')
      expect(await screen.findByRole('heading', { name: 'Continue watching' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Clear watch progress on this device' }))
      expect(screen.queryByRole('heading', { name: 'Continue watching' })).toBeNull()
      expect(localStorage.getItem(PROGRESS_KEY)).toBeNull()
    })

    it('shows what was published since the last visit, also after a reload, never on a first visit', async () => {
      const old = plainVideo('5', 'Old upload')
      const fresh = plainVideo('6', 'Fresh upload', [['published_at', '1700000100']])
      const first = renderSite(clientOf(old, fresh), '/')
      await waitFor(() => expect(screen.getByText('Fresh upload')).toBeTruthy())
      expect(screen.queryByRole('heading', { name: 'New since your last visit' })).toBeNull()
      first.unmount()

      // A later session: the last visit fell between the two uploads.
      localStorage.setItem('nostube-site:last-visit', '1700000050')
      sessionStorage.clear()
      for (let load = 0; load < 2; load++) {
        const view = renderSite(clientOf(old, fresh), '/')
        const fresher = await screen.findByRole('region', { name: 'New since your last visit' })
        expect(within(fresher).getByText('Fresh upload')).toBeTruthy()
        expect(within(fresher).queryByText('Old upload')).toBeNull()
        view.unmount()
      }
    })

    it('forgets a finished video and offers the next one', async () => {
      const first = plainVideo('5', 'First upload')
      const second = plainVideo('6', 'Second upload')
      localStorage.setItem(
        PROGRESS_KEY,
        JSON.stringify([{ ref: first.id, time: 30, duration: 120, updatedAt: Date.now() }])
      )
      renderSite(
        clientOf(first, second),
        `/v/${nip19.neventEncode({ id: first.id, author: creator })}`
      )
      const player = await screen.findByTestId('player')
      fireEvent.ended(player)
      const next = await screen.findByRole('region', { name: 'Up next' })
      expect(await within(next).findByText('Second upload')).toBeTruthy()
      expect(localStorage.getItem(PROGRESS_KEY)).toBeNull()
    })

    it('offers a retry when no source plays and restarts at the last position', async () => {
      renderSite(client, `/v/${link}`)
      const player = await screen.findByTestId('player')
      tick(player, 20)
      fireEvent.click(screen.getByTestId('player-fail'))
      expect(screen.getByRole('alert').textContent).toContain('This video could not be played.')
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
      expect(screen.getByTestId('player').getAttribute('data-start')).toBe('20')
    })

    it('lists chapters and the subtitles as seekable, searchable text', async () => {
      const chaptered = plainVideo('7', 'Chaptered', [
        ['text-track', 'https://subs.example/en.vtt', 'en'],
      ])
      const described = { ...chaptered, content: '0:00 Intro\n0:30 Verse' }
      const subtitles = [
        'WEBVTT',
        '',
        '00:00:01.000 --> 00:00:03.000',
        'Hello and welcome',
        '',
        '00:00:45.000 --> 00:00:48.000',
        'The second verse',
        '',
        '00:00:45.000 --> 00:00:47.000',
        'Sung over the first line',
      ].join('\n')
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async input =>
          String(input) === 'https://subs.example/en.vtt'
            ? new Response(subtitles)
            : Promise.reject(new Error('unexpected request'))
        )
      const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
      try {
        renderSite(
          clientOf(described),
          `/v/${nip19.neventEncode({ id: described.id, author: creator })}`
        )
        const player = await screen.findByTestId('player')
        Object.defineProperty(player, 'currentTime', {
          value: 0,
          writable: true,
          configurable: true,
        })
        fireEvent.click(screen.getByRole('button', { name: /0:30\s*Verse/ }))
        expect((player as HTMLMediaElement).currentTime).toBe(30)
        // The click marks the chapter at once, before the browser has finished seeking.
        expect(
          screen.getByRole('button', { name: /0:30\s*Verse/ }).getAttribute('aria-current')
        ).toBe('true')
        // A seek from elsewhere (scrubbing, a timestamp link) moves the marker as well.
        Object.defineProperty(player, 'currentTime', {
          value: 5,
          writable: true,
          configurable: true,
        })
        fireEvent.seeked(player)
        expect(
          screen.getByRole('button', { name: /0:00\s*Intro/ }).getAttribute('aria-current')
        ).toBe('true')
        expect(
          screen.getByRole('button', { name: /0:30\s*Verse/ }).getAttribute('aria-current')
        ).toBeNull()

        // Nothing is fetched until the reader opens the transcript.
        expect(fetchSpy).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Show transcript' }))
        expect(await screen.findByText('The second verse')).toBeTruthy()
        // Two lines may start together (overlapping subtitles): both stay listed.
        expect(screen.getByText('Sung over the first line')).toBeTruthy()
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search the transcript' }), {
          target: { value: 'welcome' },
        })
        expect(screen.queryByText('The second verse')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /0:01\s*Hello and welcome/ }))
        expect((player as HTMLMediaElement).currentTime).toBe(1)
        expect(play).toHaveBeenCalled()
      } finally {
        fetchSpy.mockRestore()
        play.mockRestore()
      }
    })
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
      relayPool: { request: () => of(profile), subscription: () => NEVER },
    } as unknown as NostubeClient

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

describe('browserLanguage', () => {
  it('takes the first supported browser language, without region, else English', () => {
    expect(browserLanguage(['it-IT', 'de-AT', 'fr'])).toBe('de')
    expect(browserLanguage(['zh-Hans-CN'])).toBe('zh')
    expect(browserLanguage(['it', 'pt-BR'])).toBe('en')
    expect(browserLanguage([])).toBe('en')
  })
})

describe('theme', () => {
  it('sets the accent, a readable text colour and the font on the root', () => {
    const root = document.createElement('div')
    applyTheme({ theme: { accent: '#ffcc00', font: 'serif' } }, root)
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
