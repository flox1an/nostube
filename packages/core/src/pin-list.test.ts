import { describe, expect, it } from 'vitest'
import { finalizeEvent, generateSecretKey } from 'nostr-tools'
import { newestPinList, replaceVideoPins } from './pin-list'

describe('video pins', () => {
  it('reorders controlled videos without erasing notes, unresolved pins or metadata', () => {
    const tags = [
      ['e', 'note', 'wss://old'],
      ['e', 'video-id'],
      ['a', '34235:author:film'],
      ['e', 'unknown'],
      ['p', 'friend'],
    ]
    expect(
      replaceVideoPins(
        tags,
        ['video-id', '34235:author:film'],
        ['34235:author:film', 'new-id', 'new-id'],
        'wss://instance'
      )
    ).toEqual([
      ['e', 'note', 'wss://old'],
      ['e', 'unknown'],
      ['p', 'friend'],
      ['a', '34235:author:film', 'wss://instance'],
      ['e', 'new-id', 'wss://instance'],
    ])
    expect(replaceVideoPins(tags, ['video-id', '34235:author:film'], [], 'wss://instance')).toEqual(
      [
        ['e', 'note', 'wss://old'],
        ['e', 'unknown'],
        ['p', 'friend'],
      ]
    )
  })

  it('selects an explicit empty replacement and breaks timestamp ties by lowest ID', () => {
    const key = generateSecretKey()
    const event = (time: number, tags: string[][]) =>
      finalizeEvent({ kind: 10001, created_at: time, tags, content: '' }, key)
    const old = event(1, [['e', 'video']])
    const empty = event(2, [])
    expect(newestPinList([empty, old])).toBe(empty)
    const sameTime = event(2, [['e', 'other']])
    const expected = empty.id < sameTime.id ? empty : sameTime
    expect(newestPinList([empty, sameTime])).toBe(expected)
    expect(newestPinList([sameTime, empty])).toBe(expected)
  })
})
