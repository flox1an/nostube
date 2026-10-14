import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SITE_LINKS,
  noSitePages,
} from '@nostube/core/instance-config'
import { AdvancedPage } from './AdvancedPage'
import type { AdminState } from './api'
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Reach on the Instance page', () => {
  it('locks Public with the reason when the address is not publicly reachable', () => {
    renderInstance(state(false))
    expect((publicTile() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Public needs an address the Nostr network can reach/)).toBeTruthy()
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
})

describe('Advanced page', () => {
  const field = (label: string) => screen.getByLabelText(label) as HTMLTextAreaElement

  it('greys out the public-only lists in Private, keeps their values, profile and mirror lists', () => {
    const s = state(true)
    render(<AdvancedPage draft={toDraft(s.config)} update={vi.fn()} state={s} />)
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
    render(
      <AdvancedPage draft={{ ...toDraft(s.config), reach: 'public' }} update={vi.fn()} state={s} />
    )
    expect(screen.queryByText(/Your instance is Private/)).toBeNull()
    for (const label of ['Video sources', 'Interaction relays', 'Profile relays']) {
      expect(field(label).disabled, label).toBe(false)
    }
  })
})
