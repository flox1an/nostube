import { describe, expect, it } from 'vitest'
import { parseVideoChapters } from './video-chapters'

describe('parseVideoChapters', () => {
  it('extracts YouTube-style chapters from a tracklist', () => {
    const chapters = parseVideoChapters(
      `~ TRACKLIST ~

0:00 What the Surface Hides
2:41 Walking the Last Mile
1:01:41 A Moon Made of Ice`,
      3829
    )

    expect(chapters).toEqual([
      { startTime: 0, title: 'What the Surface Hides' },
      { startTime: 161, title: 'Walking the Last Mile' },
      { startTime: 3701, title: 'A Moon Made of Ice' },
    ])
  })

  it('supports separators and ignores invalid or out-of-range lines', () => {
    const chapters = parseVideoChapters(
      `not a chapter
00:10 - Intro
00:70 Bad timestamp
01:20:00 Too late
01:05:30 | Finale`,
      4000
    )

    expect(chapters).toEqual([
      { startTime: 10, title: 'Intro' },
      { startTime: 3930, title: 'Finale' },
    ])
  })
})
