import { describe, expect, it } from 'vitest'
import type { VideoEvent } from '@nostube/core/video-event'
import { applyDailyGrouping } from './daily-grouping'

const DAY = 86400
const video = (id: string, pubkey: string, type: 'videos' | 'shorts', created_at: number) =>
  ({ id, pubkey, type, created_at }) as VideoEvent

describe('applyDailyGrouping', () => {
  const feed = [
    video('a1', 'alice', 'videos', 2 * DAY + 100),
    video('a2', 'alice', 'videos', 2 * DAY + 50), // same author, same day
    video('s1', 'alice', 'shorts', 2 * DAY + 40), // shorts are grouped separately
    video('b1', 'bob', 'videos', 2 * DAY + 30), // other author
    video('a3', 'alice', 'videos', DAY + 10), // other day
  ]

  it('keeps the newest long-form video and short per author and day', () => {
    expect(applyDailyGrouping(feed, true).map(v => v.id)).toEqual(['a1', 's1', 'b1', 'a3'])
  })

  it('keeps every video, newest first, when grouping is off', () => {
    expect(applyDailyGrouping(feed, false).map(v => v.id)).toEqual(['a1', 'a2', 's1', 'b1', 'a3'])
  })
})
