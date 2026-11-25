import { describe, expect, it, beforeEach } from 'vitest'
import {
  PROFILE_REQUEST_TTL_MS,
  allowProfileRequest,
  pruneProfileRequests,
  resetProfileRequests,
} from './profile-request-memo'

describe('profile request memo', () => {
  beforeEach(() => resetProfileRequests())

  it('allows the first request per scope+author and refuses repeats within the TTL', () => {
    const now = 1_000_000
    expect(allowProfileRequest('wss://a', 'pk', now)).toBe(true)
    expect(allowProfileRequest('wss://a', 'pk', now + 1000)).toBe(false)
    // Same author on another relay set is a different question.
    expect(allowProfileRequest('wss://b', 'pk', now + 1000)).toBe(true)
    // Same author, another scope, another author.
    expect(allowProfileRequest('wss://a', 'other', now + 1000)).toBe(true)
  })

  it('allows the request again after the TTL', () => {
    const now = 1_000_000
    expect(allowProfileRequest('wss://a', 'pk', now)).toBe(true)
    expect(allowProfileRequest('wss://a', 'pk', now + PROFILE_REQUEST_TTL_MS + 1)).toBe(true)
  })

  it('prunes expired entries', () => {
    const now = 1_000_000
    allowProfileRequest('wss://a', 'pk', now)
    pruneProfileRequests(now + PROFILE_REQUEST_TTL_MS / 2)
    expect(allowProfileRequest('wss://a', 'pk', now + PROFILE_REQUEST_TTL_MS / 2)).toBe(false)
    pruneProfileRequests(now + PROFILE_REQUEST_TTL_MS + 1)
    expect(allowProfileRequest('wss://a', 'pk', now + PROFILE_REQUEST_TTL_MS + 2)).toBe(true)
  })
})
