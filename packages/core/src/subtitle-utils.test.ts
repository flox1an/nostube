// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detectLanguageFromFilename, prepareSubtitleFile } from './subtitle-utils'

describe('subtitle files for native playback', () => {
  it('converts SRT timestamps to WebVTT without changing cue text and preserves existing VTT', async () => {
    const srt = new File(
      ['\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\nHello, world!\r\n'],
      'clip_en.srt',
      { type: 'application/x-subrip' }
    )
    const converted = await prepareSubtitleFile(srt)
    expect(converted.name).toBe('clip_en.vtt')
    expect(converted.type).toBe('text/vtt')
    expect(await converted.text()).toBe(
      'WEBVTT\n\n1\n00:00:01.250 --> 00:00:03.500\nHello, world!\n'
    )
    expect(detectLanguageFromFilename(srt.name)).toBe('en')
    expect(await prepareSubtitleFile(converted)).toBe(converted)
  })

  it('rejects malformed SRT rather than publishing an unplayable track', async () => {
    await expect(prepareSubtitleFile(new File(['not subtitles'], 'bad.srt'))).rejects.toThrow(
      'No SRT subtitle cues found'
    )
    const partiallyMalformed =
      '1\n00:00:01,000 --> 00:00:02,000\nValid\n\n2\n00:99:03,000 --> 00:00:04,000\nInvalid'
    await expect(prepareSubtitleFile(new File([partiallyMalformed], 'bad.srt'))).rejects.toThrow(
      'Malformed SRT subtitle cue'
    )
  })
})
