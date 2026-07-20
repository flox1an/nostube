import { describe, expect, it } from 'vitest'
import { getContentSafetyGate } from './content-safety'

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

  it('warns for configured NSFW profiles when set to warning', () => {
    expect(getContentSafetyGate(nsfwPubkey, 'warning', sources)).toBe('warning')
  })

  it('allows configured NSFW profiles when set to show', () => {
    expect(getContentSafetyGate(nsfwPubkey, 'show', sources)).toBe('visible')
  })
})
