import { fireEvent, render, screen } from '@testing-library/react'
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
  canBePublic: true,
  branding: { logo: null, favicon: null, banner: null },
  config: {
    title: 'My videos',
    creators: [PK],
    allowedWriters: [PK],
    videoSources: ['wss://videos.example.org'],
    interactionRelays: ['wss://videos.example.org'],
    profileRelays: [],
    reach: 'private',
    mirror: { relays: [], blossom: [] },
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
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
  vi.unstubAllGlobals()
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
})
