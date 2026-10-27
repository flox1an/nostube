import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import type { AdminConfig } from './api'
import './i18n'
import { NextSteps, useChecklist } from './NextSteps'

vi.mock('./signer-context', () => ({ useSigner: () => ({ mode: 'managed' }) }))

const config = (site: Partial<AdminConfig['site']> = {}): AdminConfig => ({
  title: 'T',
  creators: [],
  allowedWriters: [],
  videoSources: [],
  interactionRelays: [],
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
    ...site,
  },
})

const stats = (videos: number) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ relay: { eventsByKind: [{ kind: 34235, count: videos }] } }))
    )
  )

/** The checklist the sidebar and the start page share, as App wires it. */
function Start({
  config,
  branding,
}: {
  config: AdminConfig
  branding: Parameters<typeof useChecklist>[1]
}) {
  const checklist = useChecklist(config, branding)
  return checklist ? <NextSteps checklist={checklist} /> : null
}

const noBranding = { logo: null, favicon: null, banner: null, icon: null }

// The test runtime's own `localStorage` is not a usable Storage; a fresh in-memory one per test.
beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('NextSteps', () => {
  it('lists what is left, checks what is done, and stays dismissed', async () => {
    stats(0)
    const { unmount } = render(
      <Start config={config()} branding={{ ...noBranding, logo: '/logo.png' }} />
    )
    const upload = await screen.findByRole('link', { name: 'Upload your first video' })
    expect(upload.getAttribute('href')).toBe('#/upload')
    expect(screen.getByRole('link', { name: 'Add a logo' }).className).toContain('line-through')
    expect(screen.getByRole('link', { name: /Lightning address/ }).className).not.toContain(
      'line-through'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss next steps' }))
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull()
    unmount()

    render(<Start config={config()} branding={noBranding} />)
    await Promise.resolve()
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull()
  })

  it('is gone once everything is done', async () => {
    stats(2)
    const done = config({
      lightning: 'me@getalby.com',
      pages: { ...noSitePages(), about: { en: 'Hi' } },
    })
    render(<Start config={done} branding={{ ...noBranding, logo: '/logo.png' }} />)
    // Only the site is left to look at.
    fireEvent.click(await screen.findByRole('link', { name: 'View your site' }))
    expect(screen.queryByRole('heading', { name: 'Getting started' })).toBeNull()
    expect(localStorage.getItem('nostube-studio:site-viewed')).toBe('1')
  })
})
