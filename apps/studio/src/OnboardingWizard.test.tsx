import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SITE_LINKS,
  noSitePages,
} from '@nostube/core/instance-config'
import type { AdminState } from './api'
import { identityChoices, needsOnboarding, wizardConfig } from './onboarding-config'
import { Onboarding } from './OnboardingWizard'
import { SignerProvider } from './signer-context'
import i18n from './i18n'

const OWN = 'c'.repeat(64)
const MANAGED = 'b'.repeat(64)

const fresh = (canBePublic = true): AdminState => ({
  revision: 1,
  origin: 'https://videos.example.org',
  tls: 'proxy',
  tlsMode: 'proxy',
  bootId: 'b1',
  nostrPubkey: null,
  canBePublic,
  branding: { logo: null, favicon: null, banner: null },
  config: {
    title: 'My videos',
    creators: [],
    allowedWriters: [],
    videoSources: ['wss://videos.example.org'],
    interactionRelays: ['wss://videos.example.org'],
    profileRelays: DEFAULT_PROFILE_RELAYS,
    reach: 'private',
    mirror: { relays: [], blossom: [] },
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

const json = (body: unknown) => new Response(JSON.stringify(body))

/**
 * The studio's fetches: signer state `info`, everything the finish needs to run through, and a
 * record of every saved config. The save answers `restart: false` (no restart wait).
 */
function serve(info: { mode: 'none' | 'managed' | 'own'; pubkey: string | null }) {
  const saved: unknown[] = []
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/config' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      saved.push(body)
      return json({ revision: 2, restart: false })
    }
    if (url === '/api/admin/signer' && init?.method === 'POST') {
      return json({ mode: 'managed', pubkey: MANAGED })
    }
    if (url === '/api/admin/signer') return json(info)
    if (url === '/api/admin/stats') {
      return json({
        relay: {
          url: 'wss://videos.example.org',
          totalEvents: 0,
          eventsByKind: [],
          databaseBytes: 1,
        },
        blossom: {
          url: 'https://videos.example.org',
          files: 0,
          storageBytes: 0,
          quotaBytes: 0,
          freeDiskBytes: 5 * 1024 ** 3,
          freeSpaceReserveBytes: 1,
          uploads: 0,
          downloads: 0,
          servedBytes: 0,
        },
      })
    }
    if (url === '/admin/bind-nostr') return json('bound')
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, saved }
}

/** A pool stub: `get` answers `profile`, `publish` remembers its targets and events. */
const pool = (profile: object | null) => {
  return {
    get: vi.fn(async () => profile),
    publish: vi.fn(() => [Promise.resolve('wss://videos.example.org')]),
  }
}

const extension = {
  getPublicKey: vi.fn(async () => OWN),
  signEvent: vi.fn(async (event: object) => ({ ...event, id: 'x', pubkey: OWN, sig: 's' })),
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  ;(window as unknown as { nostr?: object }).nostr = extension
})
afterEach(() => {
  delete (window as unknown as { nostr?: object }).nostr
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const renderWizard = (state: AdminState, profilePool?: object) =>
  render(
    <StrictMode>
      <SignerProvider creatorKey={null}>
        <Onboarding state={state} onFinished={vi.fn()} pool={profilePool as never} />
      </SignerProvider>
    </StrictMode>
  )

const findLabel = (text: string) =>
  // The signer lookup waits for an extension before it decides there is none.
  screen.findByText(text, {}, { timeout: 4000 })

const click = async (name: string | RegExp) => {
  // The signer lookup waits for an extension before it decides there is none.
  const button = await screen.findByRole('button', { name }, { timeout: 4000 })
  fireEvent.click(button)
}

const continueThrough = async () => {
  await click('Next') // identity -> publishing
  await click(/^Private/) // a tile, no preselection
  await click('Next') // publishing -> site
  await click('Next') // site -> summary
}

describe('onboarding config', () => {
  it('gates on the creator list alone', () => {
    const state = fresh()
    expect(needsOnboarding(state.config)).toBe(true)
    expect(needsOnboarding({ ...state.config, creators: [OWN] })).toBe(false)
  })

  it('offers both identities with an extension, only the channel without', () => {
    expect(identityChoices({ extension: true, managedKey: false })).toEqual(['own', 'channel'])
    expect(identityChoices({ extension: false, managedKey: false })).toEqual(['channel'])
    expect(identityChoices({ extension: true, managedKey: true })).toEqual(['channel'])
  })

  it('builds the private config: own key everywhere, the lists as they were', () => {
    const base = fresh().config
    const result = wizardConfig(base, { reach: 'private', title: 'My videos', tagline: '' }, OWN)
    expect(result.errors).toEqual([])
    expect(result.config).toMatchObject({
      creators: [OWN],
      allowedWriters: [OWN],
      reach: 'private',
      mirror: { relays: [], blossom: [] },
      profileRelays: DEFAULT_PROFILE_RELAYS,
      title: 'My videos',
    })
  })

  it('builds the public config by setting the reach alone', () => {
    const base = fresh().config
    const result = wizardConfig(base, { reach: 'public', title: 'T', tagline: '' }, MANAGED)
    expect(result.errors).toEqual([])
    expect(result.config).toMatchObject({
      creators: [MANAGED],
      allowedWriters: [MANAGED],
      reach: 'public',
      videoSources: base.videoSources,
      interactionRelays: base.interactionRelays,
      profileRelays: DEFAULT_PROFILE_RELAYS,
      mirror: { relays: [], blossom: [] },
    })
  })

  it('keeps the site texts out of the key lists when nothing is chosen', () => {
    const result = wizardConfig(fresh().config, { reach: 'private', title: 'T', tagline: '' }, null)
    expect(result.errors).toEqual([])
    expect(result.config!.creators).toEqual([])
  })
})

describe('Onboarding wizard', () => {
  it('offers own and channel identity with an extension and binds the extension key', async () => {
    const { saved, fetch } = serve({ mode: 'none', pubkey: null })
    const profile = pool(null)
    renderWizard(fresh(), profile)
    expect(await screen.findByText('Own identity')).toBeTruthy()
    expect(screen.getByText('Channel identity')).toBeTruthy()

    fireEvent.click(await findLabel('Own identity'))
    await waitFor(() => expect(extension.getPublicKey).toHaveBeenCalled())
    await continueThrough()
    expect(screen.getByText('Private')).toBeTruthy()
    await click('Finish')

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({
      creators: [OWN],
      allowedWriters: [OWN],
      profileRelays: DEFAULT_PROFILE_RELAYS,
      reach: 'private',
    })
    // The extension key becomes the login key too.
    expect(fetch.mock.calls.some(([url]) => url === '/admin/bind-nostr')).toBe(true)
    expect(profile.get).toHaveBeenCalledWith(
      DEFAULT_PROFILE_RELAYS,
      { kinds: [0], authors: [OWN] },
      { maxWait: 4000 }
    )
    // No kind 0 found on the public relays, so nothing is published here (covered below).
    expect(profile.publish).not.toHaveBeenCalled()
  })

  it('asks before it takes Public and saves the reach', async () => {
    const { saved } = serve({ mode: 'none', pubkey: null })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderWizard(fresh())
    fireEvent.click(await findLabel('Channel identity'))
    await click('Next')
    await click(/^Public/)
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/cannot be fully undone/))
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    confirm.mockReturnValue(true)
    await click(/^Public/)
    await click('Next')
    await click('Next')
    expect(screen.getByText('Public')).toBeTruthy()
    await click('Finish')
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ reach: 'public', profileRelays: DEFAULT_PROFILE_RELAYS })
    confirm.mockRestore()
  })

  it('locks Public and takes Private when the address is not publicly reachable', async () => {
    serve({ mode: 'none', pubkey: null })
    renderWizard(fresh(false))
    fireEvent.click(await findLabel('Channel identity'))
    await click('Next')
    const publicTile = screen.getByRole('button', { name: /^Public/ }) as HTMLButtonElement
    expect(publicTile.disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^Private/ }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    expect(screen.getByText(/Public needs an address the Nostr network can reach/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers only the channel identity without an extension, taken without a click', async () => {
    delete (window as unknown as { nostr?: object }).nostr
    serve({ mode: 'none', pubkey: null })
    const { container } = renderWizard(fresh())
    expect(await findLabel('Channel identity')).toBeTruthy()
    expect(screen.queryByText('Own identity')).toBeNull()
    expect(screen.getByText(/Install an extension such as nos2x or Alby/)).toBeTruthy()
    const tile = screen.getByRole('button', { name: /Channel identity/ })
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    await click('Next')
    await click(/^Private/)
    await click('Next')
    // The site step points at the Appearance page in words: it is not reachable yet.
    expect(await screen.findByText(/on the Appearance page/)).toBeTruthy()
    expect(container.querySelectorAll('a:empty')).toHaveLength(0)
  })

  it('creates the managed key at Finish, binds the optional Nostr login, saves once', async () => {
    const { saved, fetch } = serve({ mode: 'none', pubkey: null })
    const profile = pool(null)
    renderWizard(fresh(), profile)
    fireEvent.click(await findLabel('Channel identity'))
    fireEvent.click(screen.getByRole('checkbox'))
    await continueThrough()
    await click('Finish')

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ creators: [MANAGED], allowedWriters: [MANAGED] })
    expect(
      fetch.mock.calls.some(([url, init]) => url === '/api/admin/signer' && init?.method === 'POST')
    ).toBe(true)
    expect(fetch.mock.calls.some(([url]) => url === '/admin/bind-nostr')).toBe(true)
    expect(profile.get).not.toHaveBeenCalled()
    expect(
      fetch.mock.calls.filter(
        ([url, init]) => url === '/api/admin/config' && init?.method === 'PUT'
      )
    ).toHaveLength(1)
  })

  it('copies the found kind 0 unchanged to the instance relay; without one it publishes nothing', async () => {
    serve({ mode: 'none', pubkey: null })
    const kind0 = {
      id: 'a'.repeat(64),
      pubkey: OWN,
      sig: 's',
      created_at: 1,
      kind: 0,
      tags: [],
      content: '{"name":"me"}',
    }
    const profile = pool(kind0)
    renderWizard(fresh(), profile)
    fireEvent.click(await findLabel('Own identity'))
    await continueThrough()
    await click('Finish')
    await waitFor(() => expect(profile.publish).toHaveBeenCalled())
    expect(profile.publish).toHaveBeenCalledWith(['wss://videos.example.org'], kind0)

    const none = pool(null)
    renderWizard(fresh(), none)
    fireEvent.click(await findLabel('Own identity'))
    await continueThrough()
    await click('Finish')
    await waitFor(() => expect(none.publish).not.toHaveBeenCalled())
  })

  it('saves nothing while the owner walks through and back out of the steps', async () => {
    const { saved } = serve({ mode: 'none', pubkey: null })
    renderWizard(fresh())
    fireEvent.click(await findLabel('Channel identity'))
    await click('Next')
    await click(/^Private/)
    await click('Back')
    expect(saved).toHaveLength(0)
    // Still only the signer status was read; the config itself was never written.
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
  })
})
