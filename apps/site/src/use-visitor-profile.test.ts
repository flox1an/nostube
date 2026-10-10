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
  it('keeps both public discovery relays when the server does not send profileRelays', () => {
    const relays = visitorProfileRelays([INSTANCE], served({}).profileRelays, [OUTBOX])
    expect(relays).toEqual([OUTBOX, INSTANCE, 'wss://purplepag.es/', 'wss://index.hzrd149.com/'])
  })

  it('asks only the instance relays of a local-only instance, not even the visitor outboxes', () => {
    const config = served({ profileRelays: [] })
    expect(visitorProfileRelays([INSTANCE], config.profileRelays, [OUTBOX])).toEqual([INSTANCE])
  })
})
