import { describe, expect, it } from 'vitest'
import { passesTrustFilter } from './useTrustFilter'

const untrustedAuthor = {
  authorPubkey: 'unscored-author',
  followedPubkeys: new Set<string>(),
}

describe('passesTrustFilter', () => {
  it('excludes an author without trust scores', () => {
    expect(
      passesTrustFilter({
        ...untrustedAuthor,
        personalScore: null,
        globalScore: null,
      })
    ).toBe(false)
  })

  it('excludes an author with an undefined score', () => {
    expect(
      passesTrustFilter({
        ...untrustedAuthor,
        personalScore: undefined,
        globalScore: 0.8,
      })
    ).toBe(false)
  })

  it('keeps the current user and followed authors without scores', () => {
    expect(
      passesTrustFilter({
        ...untrustedAuthor,
        currentUserPubkey: 'unscored-author',
        personalScore: null,
        globalScore: null,
      })
    ).toBe(true)

    expect(
      passesTrustFilter({
        ...untrustedAuthor,
        authorPubkey: 'followed-author',
        followedPubkeys: new Set(['followed-author']),
        personalScore: null,
        globalScore: null,
      })
    ).toBe(true)
  })

  it('requires both trust scores to meet their minimums', () => {
    expect(
      passesTrustFilter({
        ...untrustedAuthor,
        personalScore: 0.4,
        globalScore: 0.2,
      })
    ).toBe(true)
    expect(
      passesTrustFilter({
        ...untrustedAuthor,
        personalScore: 0.39,
        globalScore: 0.8,
      })
    ).toBe(false)
  })
})
