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

/**
 * The admin API for `admin`. Its config check restarts for a new quota and allows public reach
 * with a mirror relay and a mirror Blossom server; without them it refuses public reach.
 */
const serve = (admin: AdminState) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const json = (body: unknown) => new Response(JSON.stringify(body))
      if (url === '/api/admin/config') return json(admin)
      if (url === '/api/admin/signer') return json({ mode: 'managed', pubkey: PK })
      if (url === '/api/admin/config/check') {
        const config = JSON.parse(options!.body as string) as AdminState['config']
        const canBePublic = config.mirror.relays.length > 0 && config.mirror.blossom.length > 0
        return json({
          error: config.reach === 'public' && !canBePublic ? 'public reach needs mirrors' : null,
          restart: config.storage.quotaGib !== admin.config.storage.quotaGib,
          canBePublic,
        })
      }
      return new Response(null, { status: 404 })
    })
  )

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  location.hash = ''
})

describe('Studio save bar', () => {
  it('shows only with edits, and warns of a restart when the server says so', async () => {
    serve(state)
    location.hash = '#/appearance'
    render(<App />)

    const tagline = await screen.findByLabelText('Tagline')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    fireEvent.change(tagline, { target: { value: 'Hello' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(screen.queryByText(/restarts the server/)).toBeNull()

    location.hash = '#/storage'
    fireEvent.change(await screen.findByLabelText('Quota (GiB)'), { target: { value: '10' } })
    expect(await screen.findByText('Saving restarts the server for a few seconds.')).toBeTruthy()
  })

  it('allows public S2 reach from unsaved mirror lists and blocks removing the last mirror', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    serve({ ...state, originIsPublic: false, canBePublic: false })
    location.hash = '#/distribution'
    render(<App />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Mirror to other servers' }))
    fireEvent.change(screen.getByLabelText('Mirror relays'), {
      target: { value: 'wss://relay.example' },
    })
    fireEvent.change(screen.getByLabelText('Mirror Blossom servers'), {
      target: { value: 'https://blossom.example' },
    })
    const publicTile = screen.getByRole('button', { name: /^Public/ }) as HTMLButtonElement
    await waitFor(() => expect(publicTile.disabled).toBe(false))
    fireEvent.click(publicTile)
    fireEvent.change(screen.getByLabelText('Mirror Blossom servers'), {
      target: { value: '' },
    })
    // The server's refusal reaches the save bar and blocks saving; the reach card says why.
    expect(await screen.findByText('public reach needs mirrors')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Save and apply' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(screen.getByText(/^Public needs a public origin, or mirroring/)).toBeTruthy()
  })
})
