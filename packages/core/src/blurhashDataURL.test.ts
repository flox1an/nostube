import { describe, it, expect, vi } from 'vitest'
import { blurHashToDataURL } from './blurhashDataURL'

describe('blurHashToDataURL', () => {
  it('returns undefined for an undefined hash', () => {
    expect(blurHashToDataURL(undefined)).toBeUndefined()
  })

  it('returns a data URL for a valid blurhash', () => {
    const valid =
      '_FF}~1~p%z-p~W0fE2.S?aNH^+xu%gt79ZIV-WWVNaxu-:IpjG%MNHoMsAR,S6kCX5NxofxZNGf,W.slt7X8bFs:%1WARkxFslR*R*xDV@kDjFnOoft7WBs;t7oKafs;of'
    const result = blurHashToDataURL(valid)
    expect(result).toMatch(/^data:image\/png;base64,/)
  })

  it('does not throw and returns undefined for a malformed/truncated blurhash from an untrusted remote event', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A component-count prefix that implies a 46-char hash but the string is only 7 chars long,
    // matching the real-world crash: "ValidationError: blurhash length mismatch: length is 7 but it should be 46"
    const malformed = '_FF}~1~'
    expect(() => blurHashToDataURL(malformed)).not.toThrow()
    expect(blurHashToDataURL(malformed)).toBeUndefined()
    warnSpy.mockRestore()
  })
})
