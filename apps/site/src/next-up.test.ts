import { describe, expect, it } from 'vitest'
import { videoRef } from '@nostube/core/hidden-videos'
import type { VideoEvent } from '@nostube/core/video-event'
import { chooseNextVideo } from './next-up'

const creator = 'c'.repeat(64)
const video = (name: string, identifier?: string) =>
  ({
    id: name.repeat(64).slice(0, 64),
    kind: identifier ? 34235 : 21,
    pubkey: creator,
    identifier,
  }) as unknown as VideoEvent

const a = video('a', 'one')
const b = video('b', 'two')
const c = video('c')
const d = video('d', 'four')
const ref = (v: VideoEvent) => videoRef(v)

describe('chooseNextVideo', () => {
  it('follows the creator’s selected order after the current video', () => {
    expect(chooseNextVideo([d, c, b, a], b, [ref(a), ref(b), ref(c)])).toBe(c)
  })

  it('starts the selection when the current video is not part of it', () => {
    expect(chooseNextVideo([d, c, b, a], d, [ref(a), ref(b)])).toBe(a)
  })

  it('skips selected videos that are not loaded and the video itself', () => {
    expect(chooseNextVideo([c, a], a, [ref(a), ref(b), ref(c)])).toBe(c)
  })

  it('falls back to the newest other video after the last selected one', () => {
    expect(chooseNextVideo([d, c, a], a, [ref(a)])).toBe(d)
    expect(chooseNextVideo([a, d], a, [])).toBe(d)
  })

  it('offers nothing when the video stands alone', () => {
    expect(chooseNextVideo([a], a, [ref(a)])).toBeUndefined()
  })
})
