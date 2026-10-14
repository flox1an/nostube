import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SITE_LINKS,
  noSitePages,
} from '@nostube/core/instance-config'
import { AdvancedPage } from './AdvancedPage'
import type { AdminState, NsiteStatus } from './api'
import { toDraft } from './draft'
import i18n from './i18n'
import { InstancePage } from './InstancePage'
import { SignerProvider } from './signer-context'

const state = (canBePublic: boolean): AdminState => ({
  revision: 1,
  origin: 'https://videos.example.org',
  tls: 'proxy',
  tlsMode: 'proxy',
  bootId: 'b1',
  nostrPubkey: null,
  originIsPublic: canBePublic,
  canBePublic,
  branding: { logo: null, favicon: null, banner: null, icon: null },
  config: {
    title: 'My videos',
    creators: ['a'.repeat(64)],
    allowedWriters: [],
    videoSources: ['wss://videos.example.org'],
    interactionRelays: ['wss://videos.example.org'],
    profileRelays: DEFAULT_PROFILE_RELAYS,
    reach: 'private',
    siteHosting: 'instance',
    nsite: { gateway: 'nsite.lol', domain: '' },
    mirror: { relays: ['wss://mirror.example'], blossom: [] },
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
    site: {
      tagline: '',
      theme: { accent: '#6d28d9', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
      pages: noSitePages(),
    },
  },
})

const renderInstance = (s: AdminState) => {
  const update = vi.fn()
  render(
    <SignerProvider creatorKey={null}>
      <InstancePage draft={toDraft(s.config)} update={update} state={s} />
    </SignerProvider>
  )
  return update
}

const publicTile = () => screen.getByRole('button', { name: /^Public/ })

beforeEach(async () => {
  await i18n.changeLanguage('en')
  // No signer, no instance config, no outbox: the pages show without them.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 }))
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Reach on the Instance page', () => {
  it('locks Public with the reason when the address is not publicly reachable', () => {
    renderInstance(state(false))
    expect((publicTile() as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText(/Public needs a public origin or at least one public mirror relay/)
    ).toBeTruthy()
  })

  it('switches to Public only after the warning is confirmed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const update = renderInstance(state(true))
    expect((publicTile() as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(publicTile())
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/cannot be fully undone/))
    expect(update).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    fireEvent.click(publicTile())
    expect(update).toHaveBeenCalledWith({ reach: 'public' })
  })

  it('switches back to Private without asking', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const s = state(true)
    const update = vi.fn()
    render(
      <SignerProvider creatorKey={null}>
        <InstancePage draft={{ ...toDraft(s.config), reach: 'public' }} update={update} state={s} />
      </SignerProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /^Private/ }))
    expect(confirm).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ reach: 'private' })
  })

  it('uses draft mirrors instead of saved eligibility and rejects local-only targets', () => {
    const s = state(false)
    const draft = {
      ...toDraft(s.config),
      mirrorRelaysText: 'wss://relay.example',
      mirrorBlossomText: 'https://blossom.example',
    }
    const { rerender } = render(
      <SignerProvider creatorKey={null}>
        <InstancePage draft={draft} update={vi.fn()} state={s} />
      </SignerProvider>
    )
    expect((publicTile() as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Videos live on those servers/)).toBeTruthy()
    rerender(
      <SignerProvider creatorKey={null}>
        <InstancePage
          draft={{ ...draft, mirrorBlossomText: 'https://192.168.1.2' }}
          update={vi.fn()}
          state={s}
        />
      </SignerProvider>
    )
    expect((publicTile() as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Advanced page', () => {
  const field = (label: string) => screen.getByLabelText(label) as HTMLTextAreaElement

  it('greys out the public-only lists in Private, keeps their values, profile and mirror lists', () => {
    const s = state(true)
    render(<AdvancedPage draft={toDraft(s.config)} update={vi.fn()} />)
    expect(screen.getByText(/Your instance is Private/)).toBeTruthy()
    for (const label of ['Video sources', 'Interaction relays']) {
      expect(field(label).disabled, label).toBe(true)
    }
    expect(field('Video sources').value).toBe(s.config.videoSources.join('\n'))
    for (const label of ['Profile relays', 'Mirror relays', 'Mirror Blossom servers']) {
      expect(field(label).disabled, label).toBe(false)
    }
    expect(field('Profile relays').value).toBe(DEFAULT_PROFILE_RELAYS.join('\n'))
  })

  it('makes every list editable in Public', () => {
    const s = state(true)
    render(<AdvancedPage draft={{ ...toDraft(s.config), reach: 'public' }} update={vi.fn()} />)
    expect(screen.queryByText(/Your instance is Private/)).toBeNull()
    for (const label of ['Video sources', 'Interaction relays', 'Profile relays']) {
      expect(field(label).disabled, label).toBe(false)
    }
  })

  it('shows and retries nsite deletion failures even without configured mirrors', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/admin/outbox/retry') return new Response(JSON.stringify({ retried: 1 }))
      if (url !== '/api/admin/outbox') return new Response(null, { status: 404 })
      return new Response(
        JSON.stringify({
          relays: [],
          blossom: [],
          counts: [
            {
              target: 'https://old-mirror.example',
              kind: 'blob-delete',
              done: 0,
              pending: 0,
              failed: 1,
            },
          ],
          problems: [
            {
              kind: 'blob-delete',
              target: 'https://old-mirror.example',
              ref: 'c'.repeat(64),
              status: 'failed',
              attempts: 24,
              lastError: 'deletion refused',
              nextAttemptAt: null,
              updatedAt: 1,
            },
          ],
        })
      )
    })
    vi.stubGlobal('fetch', fetch)
    const s = state(true)
    s.config.mirror = { relays: [], blossom: [] }
    render(<AdvancedPage draft={toDraft(s.config)} update={vi.fn()} />)
    expect(await screen.findByText('deletion refused')).toBeTruthy()
    expect(screen.getAllByText('File deletion').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url === '/api/admin/outbox/retry')).toBe(true)
    )
  })
})

describe('Site hosting', () => {
  const published: NsiteStatus = {
    url: 'https://channel.nsite.lol',
    aggregate: 'b'.repeat(64),
    publishedAt: 1700000000,
    status: 'published',
    error: null,
    retained: false,
  }

  const serve = (mode = 'managed', status: NsiteStatus = published) => {
    const fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url === '/api/admin/signer'
              ? { mode, pubkey: 'a'.repeat(64) }
              : url === '/api/admin/nsite'
                ? status
                : {}
          )
        )
    )
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it.each(['own', 'none'])('does not offer nsite with %s identity', async mode => {
    serve(mode)
    const s = state(true)
    s.config.reach = 'public'
    renderInstance(s)
    await screen.findByText(/nsite requires a managed channel key/)
    expect(screen.queryByLabelText('Site hosting')).toBeNull()
  })

  it('does not offer nsite in private reach', async () => {
    serve()
    renderInstance(state(true))
    await screen.findByText(/Switch to Public to publish/)
    expect(screen.queryByLabelText('Site hosting')).toBeNull()
  })

  it('shows URL, CNAME, TLS, version and cache warning and publishes saved settings only', async () => {
    const fetch = serve()
    const s = state(true)
    s.config.reach = 'public'
    s.config.siteHosting = 'nsite'
    const draft = toDraft(s.config)
    const { rerender } = render(
      <SignerProvider creatorKey={null}>
        <InstancePage draft={draft} update={vi.fn()} state={s} dirty />
      </SignerProvider>
    )
    const publish = await screen.findByRole('button', { name: 'Publish nsite' })
    expect((publish as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Save and apply your changes before publishing/)).toBeTruthy()
    expect(screen.getByText(/TLS for your custom domain is managed by the gateway/)).toBeTruthy()
    expect(screen.getByText(/up to an hour/)).toBeTruthy()
    expect(await screen.findByText(published.aggregate!)).toBeTruthy()
    rerender(
      <SignerProvider creatorKey={null}>
        <InstancePage draft={draft} update={vi.fn()} state={s} dirty={false} />
      </SignerProvider>
    )
    await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(publish)
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url === '/api/admin/nsite/publish')).toBe(true)
    )
  })

  it('shows a failed delivery and retained public copies', async () => {
    serve('managed', {
      ...published,
      status: 'failed',
      error: 'mirror unreachable',
      retained: true,
    })
    const s = state(true)
    s.config.reach = 'public'
    s.config.siteHosting = 'nsite'
    renderInstance(s)
    expect(await screen.findByText('mirror unreachable')).toBeTruthy()
    expect(screen.getByText(/manifest and files remain public/)).toBeTruthy()
    expect(screen.getByText('Publication failed')).toBeTruthy()
  })

  it('polls a pending publication and exposes its later failure without enabling premature publish', async () => {
    vi.useFakeTimers()
    let status: NsiteStatus = { ...published, status: 'pending' }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url === '/api/admin/signer'
                ? { mode: 'managed', pubkey: 'a'.repeat(64) }
                : url === '/api/admin/nsite'
                  ? status
                  : {}
            )
          )
      )
    )
    const s = state(true)
    s.config.reach = 'public'
    s.config.siteHosting = 'nsite'
    await act(async () => {
      renderInstance(s)
    })
    expect(screen.getByText('Publication pending: waiting for files and delivery')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Publish nsite' }) as HTMLButtonElement).disabled
    ).toBe(true)
    status = { ...status, status: 'failed', error: 'delivery refused' }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText('delivery refused')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Publish nsite' }) as HTMLButtonElement).disabled
    ).toBe(false)
  })
})
