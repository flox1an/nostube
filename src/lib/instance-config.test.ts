import { describe, expect, it } from 'vitest'
import {
  decideLoad,
  parseInstanceConfig,
  scopeVideoRequest,
  type InstanceConfig,
} from './instance-config'

const CREATOR = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const RELAY = 'wss://studio.local'

const good = (): InstanceConfig => ({
  version: 1,
  revision: 3,
  origin: 'https://studio.local',
  title: "Flox's videos",
  creators: [CREATOR],
  startPage: { kind: 'creator-profile', creator: CREATOR },
  videoSources: [RELAY],
  interactionRelays: [RELAY],
  search: { mode: 'local' },
})

describe('parseInstanceConfig', () => {
  it('accepts a valid v1 config and ignores unknown fields', () => {
    expect(parseInstanceConfig({ ...good(), future: true })).toEqual({ ok: true, config: good() })
  })

  it('rejects a config with a missing field', () => {
    const { search: _search, ...body } = good()
    const result = parseInstanceConfig(body)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors).toContain('search is missing')
  })

  it('allows empty lists (none on purpose) with startPage null', () => {
    const body = {
      ...good(),
      creators: [],
      startPage: null,
      videoSources: [],
      interactionRelays: [],
    }
    expect(parseInstanceConfig(body).ok).toBe(true)
  })

  it('rejects a startPage creator that is not a displayed creator', () => {
    const body = { ...good(), startPage: { kind: 'creator-profile', creator: OTHER } }
    expect(parseInstanceConfig(body)).toMatchObject({ ok: false, kind: 'invalid' })
  })

  it('rejects an unknown contract version', () => {
    expect(parseInstanceConfig({ ...good(), version: 2 })).toMatchObject({
      ok: false,
      kind: 'unsupported-version',
    })
  })

  it('rejects an origin with a path and an empty external search url', () => {
    expect(parseInstanceConfig({ ...good(), origin: 'https://studio.local/app' }).ok).toBe(false)
    expect(parseInstanceConfig({ ...good(), search: { mode: 'external', url: '' } }).ok).toBe(false)
  })
})

describe('decideLoad', () => {
  it('runs a valid config', () => {
    expect(decideLoad({ kind: 'http', status: 200, body: good() }, null)).toEqual({
      mode: 'run',
      config: good(),
      stale: false,
    })
  })

  it('runs the last good config on 5xx or network error', () => {
    const lastGood = good()
    expect(decideLoad({ kind: 'http', status: 503 }, lastGood)).toEqual({
      mode: 'run',
      config: lastGood,
      stale: true,
    })
    expect(decideLoad({ kind: 'network-error' }, lastGood).mode).toBe('run')
  })

  it('shows the retry screen on 5xx without a last good config', () => {
    expect(decideLoad({ kind: 'http', status: 502 }, null).mode).toBe('retry')
  })

  it('shows the error screen on 404, even with a last good config', () => {
    expect(decideLoad({ kind: 'http', status: 404 }, good()).mode).toBe('error')
  })

  it('shows the error screen on an invalid body', () => {
    expect(decideLoad({ kind: 'http', status: 200, body: { version: 1 } }, good()).mode).toBe(
      'error'
    )
  })
})

describe('scopeVideoRequest', () => {
  const deletion = { kinds: [5], authors: [OTHER] }

  it('restricts video queries to creators and video sources', () => {
    expect(
      scopeVideoRequest(good(), [RELAY, 'wss://relay.primal.net'], [{ kinds: [21], limit: 50 }])
    ).toEqual({ relays: [RELAY], filters: [{ kinds: [21], limit: 50, authors: [CREATOR] }] })
  })

  it('sends nothing for a non-creator author page', () => {
    expect(scopeVideoRequest(good(), [RELAY], [{ kinds: [21], authors: [OTHER] }, deletion])).toBe(
      null
    )
  })

  it('leaves non-video requests alone', () => {
    const relays = ['wss://anywhere']
    expect(scopeVideoRequest(good(), relays, [deletion])).toEqual({ relays, filters: [deletion] })
  })
})
