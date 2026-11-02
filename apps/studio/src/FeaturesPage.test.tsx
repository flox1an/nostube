import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import type { AdminState } from './api'
import { toDraft, type Draft } from './draft'
import { FeaturesPage } from './FeaturesPage'
import i18n from './i18n'
import { SignerProvider } from './signer-context'
import { fakeAdminApi } from './test-admin-api'

const config: AdminState['config'] = {
  title: 'My videos',
  creators: ['a'.repeat(64)],
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
    theme: { accent: '#6d28d9', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: noSitePages(),
    lightning: 'me@getalby.com',
  },
}

/** The page with a draft that follows its edits, as the studio holds it. */
let latest: Draft
function Harness() {
  const [draft, setDraft] = useState(() => toDraft(config))
  latest = draft
  return (
    <SignerProvider creatorKey={null}>
      <FeaturesPage draft={draft} update={patch => setDraft(d => ({ ...d, ...patch }))} />
    </SignerProvider>
  )
}

const serveSigner = (mode: string) =>
  fakeAdminApi({ 'GET /api/admin/signer': { mode, pubkey: 'a'.repeat(64) } })
const toggle = (name: string) => screen.getByRole('switch', { name })
const lightning = () => screen.queryByLabelText('Lightning address') as HTMLInputElement | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Features page', () => {
  it('turns local search on and off', () => {
    serveSigner('none')
    render(<Harness />)
    expect(toggle('Search').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle('Search'))
    expect(latest.searchMode).toBe('local')
    fireEvent.click(toggle('Search'))
    expect(latest.searchMode).toBe('off')
  })

  it('clears the Lightning address when zaps go off and restores it when they go on again', async () => {
    serveSigner('managed')
    render(<Harness />)
    const zaps = await screen.findByRole('switch', { name: 'Zaps' })
    expect(zaps.getAttribute('aria-checked')).toBe('true')
    expect(lightning()!.value).toBe('me@getalby.com')

    fireEvent.click(zaps)
    expect(lightning()).toBeNull()
    expect(latest.lightning).toBe('')

    fireEvent.click(zaps)
    expect(lightning()!.value).toBe('me@getalby.com')
    expect(latest.lightning).toBe('me@getalby.com')
  })

  it('shows no Lightning address with an own key: zaps follow the own profile', async () => {
    serveSigner('own')
    render(<Harness />)
    expect(await screen.findByText(/Lightning address in your own Nostr profile/)).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Zaps' })).toBeNull()
    expect(lightning()).toBeNull()
  })
})
