import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { VideoEvent } from '@nostube/core/video-event'
import { useTrustFilter } from './useTrustFilter'

const scores = new Map<string, number | null>()
vi.mock('@/hooks/useTrustScore', () => ({
  useTrustScores: () => scores,
  useGlobalScores: () => scores,
  hasPendingTrustScores: () => false,
}))
const followed: string[] = []
vi.mock('@/hooks/useFollowSet', () => ({
  useFollowSet: () => ({ followedPubkeys: followed }),
}))
// Like the real hook: a fresh `user` object on every call.
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'a'.repeat(64), signer: {} } }),
}))

describe('useTrustFilter', () => {
  it('keeps filteredVideos identical across re-renders for a logged-in user', () => {
    const videos = [{ id: '1', pubkey: 'a'.repeat(64) }] as VideoEvent[]
    const { result, rerender } = renderHook(() => useTrustFilter(videos))
    const first = result.current.filteredVideos
    rerender()
    expect(result.current.filteredVideos).toBe(first)
  })
})
