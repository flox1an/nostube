import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import type { AdminState } from './api'
import { App } from './App'

const PK = 'a'.repeat(64)

const state: AdminState = {
  revision: 1,
  origin: 'https://videos.example.org',
  tls: 'proxy',
  tlsMode: 'proxy',
  bootId: 'b1',
  nostrPubkey: null,
  originIsPublic: true,
  canBePublic: true,
  branding: { logo: null, favicon: null, banner: null, icon: null },
  config: {
    title: 'My videos',
    creators: [PK],
    allowedWriters: [PK],
    videoSources: ['wss://videos.example.org'],
    interactionRelays: ['wss://videos.example.org'],
    profileRelays: [],
    signerRelays: [],
    reach: 'private',
    siteHosting: 'instance',
    nsite: { gateway: 'nsite.lol', domain: '' },
    mirror: { relays: [], blossom: [] },
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5, s3: null },
    site: {
      tagline: '',
      theme: { accent: '#8b5cf6', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
      pages: noSitePages(),
      lightning: '',
    },
  },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  location.hash = ''
})

describe('Studio save bar', () => {
  it('shows only with edits, and warns of a restart only for restart fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/admin/config'
          ? new Response(JSON.stringify(state))
          : url === '/api/admin/signer'
            ? new Response(JSON.stringify({ mode: 'managed', pubkey: PK }))
            : new Response(null, { status: 404 })
      )
    )
    location.hash = '#/appearance'
    render(<App />)

    const tagline = await screen.findByLabelText('Tagline')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    fireEvent.change(tagline, { target: { value: 'Hello' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(screen.queryByText(/restarts the server/)).toBeNull()

    location.hash = '#/instance'
    fireEvent.change(await screen.findByLabelText('Quota (GiB)'), { target: { value: '10' } })
    expect(screen.getByText('Saving restarts the server for a few seconds.')).toBeTruthy()
  })

  it.each([
    ['enabling S3', false],
    ['a new S3 secret alone', true],
  ])('warns of a restart for %s', async (_name, enabled) => {
    const s3 = enabled
      ? {
          endpoint: 'https://acc.r2.cloudflarestorage.com',
          bucket: 'videos',
          region: 'auto',
          forcePathStyle: false,
          accessKeyId: 'AKID',
          secretSet: true,
        }
      : null
    const saved = {
      ...state,
      config: { ...state.config, storage: { ...state.config.storage, s3 } },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/admin/config'
          ? new Response(JSON.stringify(saved))
          : url === '/api/admin/signer'
            ? new Response(JSON.stringify({ mode: 'managed', pubkey: PK }))
            : new Response(null, { status: 404 })
      )
    )
    location.hash = '#/instance'
    render(<App />)
    await screen.findByLabelText('Quota (GiB)')
    const type = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    if (!enabled) {
      fireEvent.click(screen.getByRole('button', { name: /^S3-compatible storage/ }))
      type('Endpoint', 'https://s3.example')
      type('Bucket', 'videos')
      type('Access key ID', 'AKID')
    }
    expect(screen.queryByText(/restarts the server/)).toBeNull()
    type('Secret access key', 'shh')
    expect(screen.getByText('Saving restarts the server for a few seconds.')).toBeTruthy()
  })

  it.each(['instance', 'private'])(
    'cancels switching nsite to %s without changing settings',
    async target => {
      const published = {
        ...state,
        config: { ...state.config, reach: 'public', siteHosting: 'nsite' },
      }
      const fetch = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(
        async url =>
          new Response(
            JSON.stringify(
              url === '/api/admin/config'
                ? published
                : url === '/api/admin/signer'
                  ? { mode: 'managed', pubkey: PK }
                  : {
                      status: 'published',
                      url: 'https://channel.nsite.lol',
                      aggregate: 'f'.repeat(64),
                      publishedAt: 1,
                      error: null,
                      retained: false,
                      relays: [],
                      servers: [],
                    }
            )
          )
      )
      vi.stubGlobal('fetch', fetch)
      location.hash = '#/instance'
      render(<App />)
      await screen.findByRole('button', { name: /^nsite hosting/ })
      if (target === 'instance') {
        fireEvent.click(screen.getByRole('button', { name: /^Website on this instance/ }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: /^Private/ }))
      }
      expect(await screen.findByRole('alertdialog')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(
        screen.getByRole('button', { name: /^nsite hosting/ }).getAttribute('aria-pressed')
      ).toBe('true')
      expect(screen.queryByText('Unsaved changes')).toBeNull()
      expect(
        fetch.mock.calls.filter(
          ([, options]) => (options as RequestInit | undefined)?.method === 'PUT'
        )
      ).toHaveLength(0)
    }
  )

  it.each([
    ['Delete now', true, 'instance'],
    ['Keep copies', false, 'instance'],
    ['Delete now', true, 'private'],
    ['Keep copies', false, 'private'],
  ] as const)('saves %s (delete: %s) when switching to %s', async (label, deleteNsite, target) => {
    let saved: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === 'PUT') {
          saved = JSON.parse(options.body as string)
          // Stay on the page instead of invoking jsdom's unimplemented reload.
          return new Response(JSON.stringify({ error: 'test refusal' }), { status: 400 })
        }
        return new Response(
          JSON.stringify(
            url === '/api/admin/config'
              ? { ...state, config: { ...state.config, reach: 'public', siteHosting: 'nsite' } }
              : url === '/api/admin/signer'
                ? { mode: 'managed', pubkey: PK }
                : {
                    status: 'published',
                    url: null,
                    aggregate: null,
                    publishedAt: null,
                    error: null,
                    retained: false,
                    relays: [],
                    servers: [],
                  }
          )
        )
      })
    )
    location.hash = '#/instance'
    render(<App />)
    await screen.findByRole('button', { name: /^nsite hosting/ })
    if (target === 'private') fireEvent.click(screen.getByRole('button', { name: /^Private/ }))
    else fireEvent.click(screen.getByRole('button', { name: /^Website on this instance/ }))
    fireEvent.click(await screen.findByRole('button', { name: label }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and apply' }))
    await waitFor(() =>
      expect(saved).toMatchObject({
        deleteNsite,
        siteHosting: 'instance',
        reach: target === 'private' ? 'private' : 'public',
      })
    )
  })

  it('allows public S2 reach from unsaved mirror lists and blocks removing the last mirror', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/admin/config')
          return new Response(
            JSON.stringify({ ...state, originIsPublic: false, canBePublic: false })
          )
        if (url === '/api/admin/signer')
          return new Response(JSON.stringify({ mode: 'managed', pubkey: PK }))
        if (url === '/api/admin/nsite')
          return new Response(
            JSON.stringify({
              status: 'disabled',
              url: null,
              aggregate: null,
              publishedAt: null,
              error: null,
              retained: false,
              relays: [],
              servers: [],
            })
          )
        return new Response(null, { status: 404 })
      })
    )
    location.hash = '#/advanced'
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Mirror relays'), {
      target: { value: 'wss://relay.example' },
    })
    fireEvent.change(screen.getByLabelText('Mirror Blossom servers'), {
      target: { value: 'https://blossom.example' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Instance' }))
    const publicTile = await screen.findByRole('button', { name: /^Public/ })
    expect((publicTile as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(publicTile)
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^nsite hosting/ }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.change(await screen.findByLabelText('Mirror Blossom servers'), {
      target: { value: '' },
    })
    expect(
      (screen.getByRole('button', { name: 'Save and apply' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      screen.getByText(/Public needs a public origin or at least one public mirror relay/)
    ).toBeTruthy()
  })
})
