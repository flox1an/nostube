import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SIGNER_RELAYS,
  DEFAULT_SITE_LINKS,
  noSitePages,
} from '@nostube/core/instance-config'
import type { AdminState } from './api'
import { toDraft } from './draft'
import i18n from './i18n'
import { RelaysPage } from './RelaysPage'

const config: AdminState['config'] = {
  title: 'My videos',
  creators: ['a'.repeat(64)],
  allowedWriters: [],
  videoSources: ['wss://videos.example.org', 'wss://relay.example'],
  interactionRelays: ['wss://videos.example.org'],
  profileRelays: DEFAULT_PROFILE_RELAYS,
  signerRelays: DEFAULT_SIGNER_RELAYS,
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
  },
}

const field = (label: string) => screen.queryByLabelText(label) as HTMLTextAreaElement | null
const privateNote = /Your instance is Private/

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('Relays page', () => {
  it('shows no read lists in Private, keeps their values, and keeps the sign-in relays editable', () => {
    const draft = toDraft(config)
    const update = vi.fn()
    const { rerender } = render(<RelaysPage draft={draft} update={update} />)
    expect(screen.getByText(privateNote)).toBeTruthy()
    expect(field('Video sources')).toBeNull()
    expect(field('Interaction relays')).toBeNull()
    expect(field('Profile relays')!.value).toBe(DEFAULT_PROFILE_RELAYS.join('\n'))
    expect(field('Additional signer relays')!.value).toBe(DEFAULT_SIGNER_RELAYS.join('\n'))
    fireEvent.change(field('Profile relays')!, { target: { value: 'wss://profiles.example' } })
    expect(update).toHaveBeenCalledWith({ profileRelaysText: 'wss://profiles.example' })

    // The hidden lists come back unchanged in Public.
    rerender(<RelaysPage draft={{ ...draft, reach: 'public' }} update={update} />)
    expect(field('Video sources')!.value).toBe(config.videoSources.join('\n'))
    expect(field('Interaction relays')!.value).toBe(config.interactionRelays.join('\n'))
  })

  it('makes every list editable in Public', () => {
    const update = vi.fn()
    render(<RelaysPage draft={{ ...toDraft(config), reach: 'public' }} update={update} />)
    expect(screen.queryByText(privateNote)).toBeNull()
    for (const label of [
      'Video sources',
      'Interaction relays',
      'Profile relays',
      'Additional signer relays',
    ]) {
      expect(field(label)!.disabled, label).toBe(false)
    }
    fireEvent.change(field('Video sources')!, { target: { value: 'wss://relay.example' } })
    expect(update).toHaveBeenCalledWith({ videoSourcesText: 'wss://relay.example' })
  })
})
