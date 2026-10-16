import { describe, expect, it } from 'vitest'
import { activeCueIndex, parseTranscript, searchTranscript } from './transcript'

const VTT = `WEBVTT - demo

NOTE this is only a comment

STYLE
::cue { color: red }

intro
00:00:01.000 --> 00:00:03.500 align:start
Hello <i>and</i> welcome

2
00:01:05,250 --> 00:01:08,000
Second &amp; third
line two

01:02:03.004 --> 01:02:05.000
Late cue

00:00:09.000 --> 00:00:08.000
Backwards timing is ignored? no, ends before start
`

describe('parseTranscript', () => {
  it('reads cues in time order and strips cue markup, notes, styles and identifiers', () => {
    expect(parseTranscript(VTT)).toEqual([
      { start: 1, end: 3.5, text: 'Hello and welcome' },
      { start: 65.25, end: 68, text: 'Second & third\nline two' },
      { start: 3723.004, end: 3725, text: 'Late cue' },
    ])
  })

  it('returns nothing for text without cues instead of inventing any', () => {
    expect(parseTranscript('WEBVTT\n\nNOTE nothing here')).toEqual([])
    expect(parseTranscript('')).toEqual([])
  })

  it('accepts a byte order mark and Windows line endings', () => {
    const cues = parseTranscript('\uFEFFWEBVTT\r\n\r\n00:00:02.000 --> 00:00:03.000\r\nHi\r\n')
    expect(cues).toEqual([{ start: 2, end: 3, text: 'Hi' }])
  })
})

describe('searchTranscript', () => {
  const cues = [
    { start: 1, end: 2, text: 'Café au lait' },
    { start: 3, end: 4, text: 'Another coffee break' },
  ]
  it('needs every word, ignoring case and diacritics', () => {
    expect(searchTranscript(cues, 'CAFE lait')).toEqual([cues[0]])
    expect(searchTranscript(cues, 'coffee tea')).toEqual([])
    expect(searchTranscript(cues, '  ')).toEqual(cues)
  })
})

describe('activeCueIndex', () => {
  const cues = [
    { start: 5, end: 8, text: 'a' },
    { start: 10, end: 12, text: 'b' },
  ]
  it('follows the last cue that started', () => {
    expect(activeCueIndex(cues, 1)).toBe(-1)
    expect(activeCueIndex(cues, 5)).toBe(0)
    expect(activeCueIndex(cues, 9)).toBe(0)
    expect(activeCueIndex(cues, 10)).toBe(1)
    expect(activeCueIndex(cues, 999)).toBe(1)
  })
})
