import { describe, expect, it } from 'vitest'
import { formatChatTime } from './chat-time'

describe('chat timestamps', () => {
  it('keeps regional hour cycles without a day-period marker', () => {
    const seconds = new Date(2026, 10, 4, 16, 45).getTime() / 1000
    expect(formatChatTime(seconds, 'en-US')).toBe('04:45')
    expect(formatChatTime(seconds, 'de-DE')).toBe('16:45')
    expect(formatChatTime(seconds, 'en-GB')).toBe('16:45')
  })
})
