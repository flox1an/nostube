import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { DEFAULT_PROFILE_RELAYS, DEFAULT_SITE_LINKS } from '@nostube/core/instance-config'
import { processEvent } from '@nostube/core/video-event'
import { finalizeEvent, generateSecretKey } from 'nostr-tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Api from './api'
import type { AdminConfig } from './api'
import { App } from './App'
import './i18n'

const video = processEvent(
  finalizeEvent(
    {
      kind: 34235,
      created_at: 100,
      content: '',
      tags: [
        ['d', 'intro'],
        ['title', 'Intro'],
        ['imeta', 'url https://media.example/a.mp4', 'm video/mp4'],
      ],
    },
    generateSecretKey()
  ),
  []
)!

const config: AdminConfig = {
  title: 'Flox',
  creators: [video.pubkey],
  allowedWriters: [video.pubkey],
  videoSources: ['wss://relay.example'],
  interactionRelays: [],
  profileRelays: DEFAULT_PROFILE_RELAYS,
  mirror: { relays: [], blossom: [] },
  search: { mode: 'off' },
  storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
  site: {
    tagline: 'Hi',
    theme: { accent: '#6d28d9', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: { about: {}, imprint: {}, privacy: {} },
  },
}

const mocks = vi.hoisted(() => ({ saveConfig: vi.fn() }))
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof Api>()),
  loadAdmin: async () => ({
    revision: 1,
    origin: 'https://site.example',
    tls: '',
    tlsMode: 'proxy',
    bootId: 'boot',
    nostrPubkey: null,
    config,
    branding: { logo: null, favicon: null, banner: null },
  }),
  saveConfig: mocks.saveConfig,
  loadSchedule: async () => [],
}))
vi.mock('./signer-context', () => ({
  SignerProvider: ({ children }: { children: ReactNode }) => children,
  useSigner: () => ({ status: 'none', mode: 'none', signer: null, pubkey: null }),
}))
vi.mock('./instance-client', () => ({
  bootInstanceClient: async () => ({ config: { startPage: 'creator' }, client: {} }),
}))
// Renders lazily, after the static imports are in.
vi.mock('@nostube/widgets/instance-providers', () => ({
  InstanceProviders: ({ children }: { children: ReactNode }) => (
    <TooltipProvider>{children}</TooltipProvider>
  ),
}))
vi.mock('@nostube/widgets/hooks/useCreatorVideos', () => ({
  useCreatorVideos: () => ({ videos: [video], loading: false, error: null, hasMore: false }),
}))

beforeEach(() => {
  location.hash = '#/videos'
  mocks.saveConfig.mockReset().mockResolvedValue({ revision: 2, restart: false })
})

describe('studio videos page', () => {
  it('saves hiding at once, without a save bar, and keeps the other pages in step', async () => {
    render(<App />)
    const more = await screen.findByRole('button', { name: 'More actions' })
    expect(screen.getByRole('link', { name: 'Upload' }).getAttribute('href')).toBe('#/upload')
    expect(screen.queryByRole('button', { name: 'Save and apply' })).toBeNull()

    fireEvent.keyDown(more, { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide on site' }))
    await screen.findByText(/· Hidden/)
    const ref = `34235:${video.pubkey}:intro`
    expect(mocks.saveConfig).toHaveBeenCalledExactlyOnceWith({
      ...config,
      site: { ...config.site, videos: { hidden: [ref] } },
    })

    // The saved hidden list is the new baseline: another page has nothing pending.
    act(() => {
      location.hash = '#/appearance'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Save and apply' }).disabled
      ).toBe(true)
    )
  })

  it('keeps the video shown and says why when saving fails', async () => {
    mocks.saveConfig.mockRejectedValue(new Error('server said no'))
    render(<App />)
    fireEvent.keyDown(await screen.findByRole('button', { name: 'More actions' }), {
      key: 'Enter',
    })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide on site' }))
    expect((await screen.findByRole('alert')).textContent).toBe('server said no')
    expect(screen.queryByText(/· Hidden/)).toBeNull()
  })
})
