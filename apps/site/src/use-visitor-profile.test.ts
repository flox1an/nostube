import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_LINKS, parseInstanceConfig } from '@nostube/core/instance-config'
import { visitorProfileRelays } from './use-visitor-profile'

const INSTANCE = 'wss://videos.example/'
const OUTBOX = 'wss://personal.example/'
const served = (extra: object) => {
  const parsed = parseInstanceConfig({
    version: 1,
    revision: 1,
    origin: 'https://videos.example',
    title: 'T',
    creators: [],
    startPage: null,
    videoSources: [INSTANCE],
    interactionRelays: [INSTANCE],
    search: { mode: 'off' },
    site: {
      tagline: '',
      theme: { accent: '#112233', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
    },
    ...extra,
  })
  if (!parsed.ok) throw new Error(parsed.errors.join('; '))
  return parsed.config
}

describe('visitorProfileRelays', () => {
  it('asks only the instance relays when the instance is private', () => {
    const config = served({})
    expect(config.reach).toBe('private')
    expect(visitorProfileRelays(config.reach, [INSTANCE], config.profileRelays, [OUTBOX])).toEqual([
      INSTANCE,
    ])
  })

  it('keeps both public discovery relays when a public server does not send profileRelays', () => {
    const config = served({ reach: 'public' })
    expect(visitorProfileRelays(config.reach, [INSTANCE], config.profileRelays, [OUTBOX])).toEqual([
      OUTBOX,
      INSTANCE,
      'wss://purplepag.es/',
      'wss://index.hzrd149.com/',
    ])
  })

  it('keeps public discovery and visitor outboxes even when the instance config has no profile relays', () => {
    const config = served({ reach: 'public', profileRelays: [] })
    expect(visitorProfileRelays(config.reach, [INSTANCE], config.profileRelays, [OUTBOX])).toEqual([
      OUTBOX,
      INSTANCE,
      'wss://purplepag.es/',
      'wss://index.hzrd149.com/',
    ])
  })

  it('adds configured profile relays without replacing public discovery', () => {
    expect(visitorProfileRelays('public', [INSTANCE], ['wss://custom.example'], [])).toEqual([
      INSTANCE,
      'wss://custom.example/',
      'wss://purplepag.es/',
      'wss://index.hzrd149.com/',
    ])
  })
})
