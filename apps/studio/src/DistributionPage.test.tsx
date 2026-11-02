import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SIGNER_RELAYS,
  DEFAULT_SITE_LINKS,
  noSitePages,
} from '@nostube/core/instance-config'
import type { AdminState, NsiteStatus } from './api'
import { DistributionPage } from './DistributionPage'
import { toDraft, type Draft } from './draft'
import i18n from './i18n'
import { SignerProvider } from './signer-context'
import { fakeAdminApi } from './test-admin-api'

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
    signerRelays: DEFAULT_SIGNER_RELAYS,
    reach: 'private',
    siteHosting: 'instance',
    nsite: { gateway: 'nsite.lol', domain: '' },
    mirror: { relays: ['wss://mirror.example'], blossom: [] },
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5, s3: null },
    site: {
      tagline: '',
      theme: { accent: '#6d28d9', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
      pages: noSitePages(),
    },
  },
})

const page = (
  s: AdminState,
  draft: Draft,
  update: (patch: Partial<Draft>) => void = vi.fn(),
  dirty = false
) => (
  <SignerProvider creatorKey={null}>
    <DistributionPage
      draft={draft}
      update={update}
      state={s}
      dirty={dirty}
      canBePublic={s.canBePublic}
    />
  </SignerProvider>
)

const renderPage = (s: AdminState, draft = toDraft(s.config)) => {
  const update = vi.fn()
  render(page(s, draft, update))
  return update
}

/** The page with a draft that follows its edits, as the studio holds it. */
let latest: Draft
function Harness({ s, initial }: { s: AdminState; initial?: Partial<Draft> }) {
  const [draft, setDraft] = useState(() => ({ ...toDraft(s.config), ...initial }))
  latest = draft
  return page(s, draft, patch => setDraft(d => ({ ...d, ...patch })))
}

const publicTile = () => screen.getByRole('button', { name: /^Public/ }) as HTMLButtonElement
const toggle = (name: string) => screen.getByRole('switch', { name }) as HTMLButtonElement
const mirrorSwitch = () => toggle('Mirror to other servers')
const nsiteSwitch = () => toggle('Publish as nsite')
const field = (label: string) => screen.queryByLabelText(label) as HTMLTextAreaElement | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  // No signer, no instance config, no outbox: the page shows without them.
  fakeAdminApi({})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Reach', () => {
  it('locks Public with the reason when the address is not publicly reachable', () => {
    renderPage(state(false))
    expect(publicTile().disabled).toBe(true)
    expect(screen.getByText(/^Public needs a public origin, or mirroring/)).toBeTruthy()
  })

  it('switches to Public only after the warning is confirmed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const update = renderPage(state(true))
    expect(publicTile().disabled).toBe(false)
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
    const update = renderPage(s, { ...toDraft(s.config), reach: 'public' })
    fireEvent.click(screen.getByRole('button', { name: /^Private/ }))
    expect(confirm).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ reach: 'private' })
  })
})

describe('Mirroring', () => {
  it('is on while a list holds a target and shows both lists editable', () => {
    const update = renderPage(state(true))
    expect(mirrorSwitch().getAttribute('aria-checked')).toBe('true')
    expect(field('Mirror relays')!.value).toBe('wss://mirror.example')
    fireEvent.change(field('Mirror Blossom servers')!, {
      target: { value: 'https://blossom.example' },
    })
    expect(update).toHaveBeenCalledWith({ mirrorBlossomText: 'https://blossom.example' })
  })

  it('is off without targets and hides the lists until switched on', () => {
    const s = state(true)
    s.config.mirror = { relays: [], blossom: [] }
    render(<Harness s={s} />)
    expect(mirrorSwitch().getAttribute('aria-checked')).toBe('false')
    expect(field('Mirror relays')).toBeNull()
    fireEvent.click(mirrorSwitch())
    expect(field('Mirror relays')!.value).toBe('')
    expect(field('Mirror Blossom servers')!.value).toBe('')
  })

  it('empties both lists when switched off and restores them when switched on before saving', () => {
    render(<Harness s={state(true)} initial={{ mirrorBlossomText: 'https://blossom.example' }} />)
    fireEvent.click(mirrorSwitch())
    expect(mirrorSwitch().getAttribute('aria-checked')).toBe('false')
    expect(field('Mirror relays')).toBeNull()
    expect(latest.mirrorRelaysText).toBe('')
    expect(latest.mirrorBlossomText).toBe('')

    fireEvent.click(mirrorSwitch())
    expect(field('Mirror relays')!.value).toBe('wss://mirror.example')
    expect(field('Mirror Blossom servers')!.value).toBe('https://blossom.example')
  })

  it('cannot be switched off while a Public instance without public address lives on its mirrors', () => {
    const s = state(false)
    const draft = {
      ...toDraft(s.config),
      reach: 'public' as const,
      mirrorBlossomText: 'https://blossom.example',
    }
    const { rerender } = render(page(s, draft))
    expect(mirrorSwitch().disabled).toBe(true)
    expect(mirrorSwitch().getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Switch to Private before turning mirroring off/)).toBeTruthy()

    rerender(page(s, { ...draft, reach: 'private' }))
    expect(mirrorSwitch().disabled).toBe(false)
    expect(screen.queryByText(/Switch to Private before turning mirroring off/)).toBeNull()
  })

  it('shows and retries nsite deletion failures even without configured mirrors', async () => {
    const { sent } = fakeAdminApi({
      'POST /api/admin/outbox/retry': { retried: 1 },
      'GET /api/admin/outbox': {
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
      },
    })
    const s = state(true)
    s.config.mirror = { relays: [], blossom: [] }
    renderPage(s)
    expect(await screen.findByText('deletion refused')).toBeTruthy()
    expect(screen.getAllByText('File deletion').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))
    await waitFor(() => expect(sent('POST /api/admin/outbox/retry')).toHaveLength(1))
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
    relays: [],
    servers: [],
  }
  const emptyOutbox = { relays: [], blossom: [], counts: [], problems: [] }

  const serveNsite = (mode = 'managed', status: () => NsiteStatus = () => published) =>
    fakeAdminApi({
      'GET /api/admin/signer': { mode, pubkey: 'a'.repeat(64) },
      'GET /api/admin/nsite': status,
      'GET /api/admin/outbox': emptyOutbox,
      'POST /api/admin/nsite/publish': {},
    })

  const nsiteOn = () => {
    const s = state(true)
    s.config.reach = 'public'
    s.config.siteHosting = 'nsite'
    return s
  }

  it.each(['own', 'none'])('does not offer nsite with %s identity', async mode => {
    serveNsite(mode)
    const s = state(true)
    s.config.reach = 'public'
    renderPage(s)
    await screen.findByText(/nsite requires a managed channel key/)
    expect(nsiteSwitch().disabled).toBe(true)
  })

  it('does not offer nsite in private reach', async () => {
    serveNsite()
    renderPage(state(true))
    await screen.findByText(/Switch to Public to publish/)
    expect(nsiteSwitch().disabled).toBe(true)
  })

  it('switches between nsite and the website on this instance', async () => {
    serveNsite()
    const s = state(true)
    s.config.reach = 'public'
    const update = renderPage(s)
    await waitFor(() => expect(nsiteSwitch().disabled).toBe(false))
    expect(screen.queryByLabelText('Gateway')).toBeNull()
    fireEvent.click(nsiteSwitch())
    expect(update).toHaveBeenCalledWith({ siteHosting: 'nsite' })
  })

  it('shows URL, CNAME, TLS, version and cache warning and publishes saved settings only', async () => {
    const { sent } = serveNsite()
    const s = nsiteOn()
    const draft = toDraft(s.config)
    const { rerender } = render(page(s, draft, vi.fn(), true))
    expect(nsiteSwitch().getAttribute('aria-checked')).toBe('true')
    const publish = (await screen.findByRole('button', {
      name: 'Publish nsite',
    })) as HTMLButtonElement
    expect(publish.disabled).toBe(true)
    expect(screen.getByText(/Save and apply your changes before publishing/)).toBeTruthy()
    expect(screen.getByText(/TLS for your custom domain is managed by the gateway/)).toBeTruthy()
    expect(screen.getByText(/up to an hour/)).toBeTruthy()
    expect(await screen.findByText(published.aggregate!)).toBeTruthy()
    rerender(page(s, draft, vi.fn(), false))
    await waitFor(() => expect(publish.disabled).toBe(false))
    fireEvent.click(publish)
    await waitFor(() => expect(sent('POST /api/admin/nsite/publish')).toHaveLength(1))
  })

  it('shows a failed delivery and retained public copies', async () => {
    serveNsite('managed', () => ({
      ...published,
      status: 'failed',
      error: 'mirror unreachable',
      retained: true,
    }))
    renderPage(nsiteOn())
    expect(await screen.findByText('mirror unreachable')).toBeTruthy()
    expect(screen.getByText(/manifest and files remain public/)).toBeTruthy()
    expect(screen.getByText('Publication failed')).toBeTruthy()
  })

  it('notes retained public copies while nsite is off', async () => {
    serveNsite('managed', () => ({ ...published, retained: true }))
    const s = state(true)
    s.config.reach = 'public'
    renderPage(s)
    expect(await screen.findByText(/manifest and files remain public/)).toBeTruthy()
    expect(nsiteSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('lists which relays and Blossom servers have the version, with a retry error once', async () => {
    const error = 'cannot connect: HTTP error: 503 Service Unavailable'
    serveNsite('managed', () => ({
      ...published,
      status: 'pending',
      error,
      relays: [
        { target: 'wss://nos.lol', status: 'done', error: null },
        { target: 'wss://relay.damus.io', status: 'pending', error },
      ],
      servers: [
        { target: 'https://blossom.example', status: 'failed', error: 'full', done: 3, total: 5 },
      ],
    }))
    renderPage(nsiteOn())
    expect(await screen.findByText('Relays: 1 of 2 have the manifest')).toBeTruthy()
    expect(screen.getByText('wss://relay.damus.io')).toBeTruthy()
    expect(screen.getAllByText(error)).toHaveLength(1)
    expect(screen.getByText('Blossom servers: 0 of 1 have all files')).toBeTruthy()
    expect(screen.getByText(/failed · 3 of 5 files/)).toBeTruthy()
  })

  it('polls a pending publication and exposes its later failure without enabling premature publish', async () => {
    vi.useFakeTimers()
    let status: NsiteStatus = { ...published, status: 'pending' }
    serveNsite('managed', () => status)
    await act(async () => {
      renderPage(nsiteOn())
    })
    expect(screen.getByText('Publication pending: waiting for files and delivery')).toBeTruthy()
    const publish = () => screen.getByRole('button', { name: 'Publish nsite' }) as HTMLButtonElement
    expect(publish().disabled).toBe(true)
    status = { ...status, status: 'failed', error: 'delivery refused' }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText('delivery refused')).toBeTruthy()
    expect(publish().disabled).toBe(false)
  })
})
