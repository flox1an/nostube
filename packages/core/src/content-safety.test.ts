import { describe, expect, it } from 'vitest'
import { getContentSafetyGate, getEffectiveNsfwFilter, getVideoPlayback } from './content-safety'

const nsfwPubkey = 'nsfw-pubkey'
const blockedPubkey = 'blocked-pubkey'

const sources = {
  nsfwPubkeys: [nsfwPubkey],
  blockedPubkeys: { [blockedPubkey]: true },
}

describe('getContentSafetyGate', () => {
  it('allows profiles that are not in a configured safety list', () => {
    expect(getContentSafetyGate('safe-pubkey', 'hide', sources)).toBe('visible')
  })

  it('always hides effective blocked pubkeys', () => {
    expect(getContentSafetyGate(blockedPubkey, 'show', sources)).toBe('hidden')
    expect(getContentSafetyGate(blockedPubkey, 'warning', sources)).toBe('hidden')
  })

  it('hides configured NSFW profiles by default and when set to hide', () => {
    expect(getContentSafetyGate(nsfwPubkey, undefined, sources)).toBe('hidden')
    expect(getContentSafetyGate(nsfwPubkey, 'hide', sources)).toBe('hidden')
  })

  it('keeps configured NSFW profiles reachable when set to warning (media is blurred instead)', () => {
    expect(getContentSafetyGate(nsfwPubkey, 'warning', sources)).toBe('visible')
  })

  it('allows configured NSFW profiles when set to show', () => {
    expect(getContentSafetyGate(nsfwPubkey, 'show', sources)).toBe('visible')
  })
})

describe('getEffectiveNsfwFilter', () => {
  it('treats viewers without settings as hide', () => {
    expect(getEffectiveNsfwFilter(null, true)).toBe('hide')
    expect(getEffectiveNsfwFilter({}, true)).toBe('hide')
  })

  it('ignores an opt-in without the 18+ confirmation', () => {
    expect(getEffectiveNsfwFilter({ nsfwFilter: 'show' }, true)).toBe('hide')
    expect(getEffectiveNsfwFilter({ nsfwFilter: 'warning', nsfwAgeConfirmed: 'yes' }, true)).toBe(
      'hide'
    )
  })

  it('honours a confirmed opt-in', () => {
    expect(getEffectiveNsfwFilter({ nsfwFilter: 'warning', nsfwAgeConfirmed: true }, true)).toBe(
      'warning'
    )
    expect(getEffectiveNsfwFilter({ nsfwFilter: 'show', nsfwAgeConfirmed: true }, true)).toBe(
      'show'
    )
  })

  it('falls back to hide for unknown values even when confirmed', () => {
    expect(getEffectiveNsfwFilter({ nsfwFilter: 'all', nsfwAgeConfirmed: true }, true)).toBe('hide')
  })

  it('drops the confirmation requirement only when the deployment disables safety', () => {
    expect(getEffectiveNsfwFilter({ nsfwFilter: 'show' }, false)).toBe('show')
    expect(getEffectiveNsfwFilter(null, false)).toBe('hide')
  })
})

describe('getVideoPlayback', () => {
  it('plays unflagged videos in every mode', () => {
    expect(getVideoPlayback(undefined, 'hide')).toBe('play')
    expect(getVideoPlayback(undefined, undefined)).toBe('play')
  })

  it('never plays flagged videos for viewers in hide mode or without a setting', () => {
    expect(getVideoPlayback('NSFW', 'hide')).toBe('hidden')
    expect(getVideoPlayback('NSFW', undefined)).toBe('hidden')
  })

  it('requires a click-through in warning mode and plays in show mode', () => {
    expect(getVideoPlayback('NSFW', 'warning')).toBe('warn')
    expect(getVideoPlayback('NSFW', 'show')).toBe('play')
  })
})
