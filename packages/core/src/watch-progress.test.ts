import { describe, expect, it } from 'vitest'
import {
  forgetWatchProgress,
  isResumable,
  MAX_PROGRESS_ENTRIES,
  parseWatchProgress,
  PROGRESS_MAX_AGE_MS,
  recordWatchProgress,
  startPosition,
  type WatchProgress,
} from './watch-progress'

const NOW = 1_800_000_000_000
const entry = (ref: string, time: number, duration = 200, updatedAt = NOW): WatchProgress => ({
  ref,
  time,
  duration,
  updatedAt,
})

describe('what counts as resumable', () => {
  it('needs a meaningful start and no near-complete position', () => {
    expect(isResumable({ time: 4, duration: 200 })).toBe(false)
    expect(isResumable({ time: 5, duration: 200 })).toBe(true)
    expect(isResumable({ time: 189, duration: 200 })).toBe(true)
    expect(isResumable({ time: 190, duration: 200 })).toBe(false)
    expect(isResumable({ time: 50, duration: 0 })).toBe(false)
  })
})

describe('recordWatchProgress', () => {
  it('keeps the newest position first and replaces the same video', () => {
    const first = recordWatchProgress([], { ref: 'a', time: 30, duration: 200 }, NOW)
    const second = recordWatchProgress(first, { ref: 'b', time: 40.9, duration: 200 }, NOW + 1)
    const again = recordWatchProgress(second, { ref: 'a', time: 60, duration: 200 }, NOW + 2)
    expect(again.map(item => [item.ref, item.time])).toEqual([
      ['a', 60],
      ['b', 40],
    ])
  })

  it('drops a video once it is finished or only just opened', () => {
    const list = [entry('a', 30), entry('b', 30)]
    expect(recordWatchProgress(list, { ref: 'a', time: 195, duration: 200 }, NOW)).toEqual([
      entry('b', 30),
    ])
    expect(recordWatchProgress(list, { ref: 'b', time: 1, duration: 200 }, NOW)).toEqual([
      entry('a', 30),
    ])
  })

  it('never grows beyond the cap', () => {
    let list: WatchProgress[] = []
    for (let i = 0; i < MAX_PROGRESS_ENTRIES + 5; i++)
      list = recordWatchProgress(list, { ref: `v${i}`, time: 30, duration: 200 }, NOW + i)
    expect(list).toHaveLength(MAX_PROGRESS_ENTRIES)
    expect(list[0].ref).toBe(`v${MAX_PROGRESS_ENTRIES + 4}`)
  })
})

describe('parseWatchProgress', () => {
  it('survives corrupt storage and keeps only valid, recent entries', () => {
    expect(parseWatchProgress('{bad json', NOW)).toEqual([])
    expect(parseWatchProgress(JSON.stringify({ ref: 'a' }), NOW)).toEqual([])
    const stored = JSON.stringify([
      entry('recent', 30, 200, NOW - 1),
      entry('old', 30, 200, NOW - PROGRESS_MAX_AGE_MS - 1),
      { ref: 'broken', time: 'x', duration: 1, updatedAt: NOW },
      { ref: '', time: 30, duration: 200, updatedAt: NOW },
    ])
    expect(parseWatchProgress(stored, NOW).map(item => item.ref)).toEqual(['recent'])
  })
})

describe('starting position', () => {
  it('lets an explicit link time win over the saved position, even zero', () => {
    const saved = entry('a', 80)
    expect(startPosition(12, saved)).toBe(12)
    expect(startPosition(0, saved)).toBe(0)
    expect(startPosition(null, saved)).toBe(80)
    expect(startPosition(null, undefined)).toBe(0)
    expect(startPosition(null, entry('a', 199))).toBe(0)
  })
})

describe('forgetWatchProgress', () => {
  it('removes only the named video', () => {
    expect(forgetWatchProgress([entry('a', 30), entry('b', 30)], 'a').map(i => i.ref)).toEqual([
      'b',
    ])
  })
})
