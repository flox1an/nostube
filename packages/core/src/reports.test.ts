import { describe, expect, it } from 'vitest'
import { buildReportTags } from './reports'

const AUTHOR = 'a'.repeat(64)
const EVENT_ID = 'e'.repeat(64)

describe('buildReportTags', () => {
  it('tags a video report with its event id and author', () => {
    expect(buildReportTags({ type: 'video', id: EVENT_ID, author: AUTHOR }, 'spam')).toEqual([
      ['e', EVENT_ID, 'spam'],
      ['p', AUTHOR, 'spam'],
    ])
  })

  it('tags a comment report the same way as a video report', () => {
    expect(
      buildReportTags({ type: 'comment', id: EVENT_ID, author: AUTHOR }, 'harassment')
    ).toEqual([
      ['e', EVENT_ID, 'harassment'],
      ['p', AUTHOR, 'harassment'],
    ])
  })

  it('drops the p tag when the content author is not known', () => {
    expect(buildReportTags({ type: 'video', id: EVENT_ID }, 'spam')).toEqual([
      ['e', EVENT_ID, 'spam'],
    ])
  })

  it('tags a profile report with only a p tag, ignoring any author field', () => {
    expect(
      buildReportTags({ type: 'profile', id: AUTHOR, author: AUTHOR }, 'impersonation')
    ).toEqual([['p', AUTHOR, 'impersonation']])
  })
})
