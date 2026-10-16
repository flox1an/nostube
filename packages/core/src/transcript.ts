export interface TranscriptCue {
  start: number
  end: number
  text: string
}

const TIMING =
  /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s+-->\s+(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

const seconds = (h: string | undefined, m: string, s: string, ms: string) =>
  Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000

/** Cue text without WebVTT markup tags and entities that matter for reading. */
const plain = (text: string) =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

/**
 * Reads WebVTT (and SRT-style comma timings) into ordered cues. Notes, styles, regions and cue
 * identifiers are skipped; unreadable blocks are ignored. Nothing is generated: no cues in, none out.
 */
export function parseTranscript(source: string): TranscriptCue[] {
  const blocks = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
  const cues: TranscriptCue[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const at = lines.findIndex(line => TIMING.test(line))
    if (at === -1 || lines[0].startsWith('NOTE')) continue
    const match = TIMING.exec(lines[at])
    if (!match) continue
    const start = seconds(match[1], match[2], match[3], match[4])
    const end = seconds(match[5], match[6], match[7], match[8])
    const text = plain(lines.slice(at + 1).join('\n'))
    if (text && end >= start) cues.push({ start, end, text })
  }
  return cues.sort((a, b) => a.start - b.start)
}

/** Cues containing every word of the query, case and diacritics ignored. */
export function searchTranscript(cues: TranscriptCue[], query: string): TranscriptCue[] {
  const fold = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return cues
  return cues.filter(cue => {
    const text = fold(cue.text)
    return words.every(word => text.includes(word))
  })
}

/** Index of the cue playing at `time` (the last one that started), or -1 before the first. */
export function activeCueIndex(cues: TranscriptCue[], time: number): number {
  let found = -1
  for (let i = 0; i < cues.length && cues[i].start <= time; i++) found = i
  return found
}
