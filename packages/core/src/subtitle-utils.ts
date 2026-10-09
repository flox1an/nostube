import langs from 'langs'

/**
 * Common language codes and their variations in filenames
 */
const LANGUAGE_PATTERNS: Record<string, string> = {
  // Full names
  english: 'en',
  german: 'de',
  deutsch: 'de',
  french: 'fr',
  francais: 'fr',
  spanish: 'es',
  espanol: 'es',
  italian: 'it',
  italiano: 'it',
  portuguese: 'pt',
  portugues: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  korean: 'ko',
  dutch: 'nl',
  polish: 'pl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  arabic: 'ar',
  hebrew: 'he',
  turkish: 'tr',
  greek: 'el',
  hindi: 'hi',
  thai: 'th',
  vietnamese: 'vi',
  indonesian: 'id',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  ukrainian: 'uk',
}

/**
 * Detect language code from a subtitle filename
 * Supports patterns like:
 * - video_en.vtt -> en
 * - video.en.vtt -> en
 * - video-english.vtt -> en
 * - english.vtt -> en
 * - video_en-US.vtt -> en
 *
 * @param filename The subtitle filename
 * @returns ISO 639-1 language code or empty string if not detected
 */
export function detectLanguageFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(vtt|srt|ass|ssa|sub)$/i, '')
  const lowerName = nameWithoutExt.toLowerCase()

  // Try to find language code patterns
  // Pattern: _xx, .xx, -xx at the end (where xx is 2-3 letter code)
  const codeMatch = lowerName.match(/[_.-]([a-z]{2,3})(?:[_-][a-z]{2})?$/)
  if (codeMatch) {
    const code = codeMatch[1]
    // Validate it's a real language code using langs library
    const entry =
      langs.where('1', code) ||
      langs.where('2', code) ||
      langs.where('2T', code) ||
      langs.where('2B', code) ||
      langs.where('3', code)
    if (entry) {
      // Return ISO 639-1 code if available
      return entry['1'] || code
    }
  }

  // Try full language name patterns
  for (const [pattern, code] of Object.entries(LANGUAGE_PATTERNS)) {
    // Check if pattern appears as a word boundary
    const regex = new RegExp(`[_.-]${pattern}$|^${pattern}[_.-]|^${pattern}$`)
    if (regex.test(lowerName)) {
      return code
    }
  }

  return ''
}

/**
 * Generate a unique ID for a subtitle
 */
export function generateSubtitleId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Native players consume WebVTT; preserve VTT files and convert only SRT cue timing lines. */
export async function prepareSubtitleFile(file: File): Promise<File> {
  if (!/\.srt$/i.test(file.name)) return file
  const source = (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const timing =
    /^(\d{2,}:[0-5]\d:[0-5]\d)[,.](\d{3})([ \t]+-->[ \t]+)(\d{2,}:[0-5]\d:[0-5]\d)[,.](\d{3})[ \t]*$/m
  const blocks = source.trim().split(/\n[ \t]*\n/)
  if (!timing.test(source)) throw new Error('No SRT subtitle cues found')
  for (const block of blocks) {
    const lines = block.split('\n')
    if (/^\d+$/.test(lines[0])) lines.shift()
    const match = lines[0]?.match(timing)
    if (!match || lines.length < 2) throw new Error('Malformed SRT subtitle cue')
    const start =
      match[1].split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0) +
      Number(match[2]) / 1000
    const end =
      match[4].split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0) +
      Number(match[5]) / 1000
    if (end <= start) throw new Error('Malformed SRT subtitle cue timing')
  }
  const body = source.replace(new RegExp(timing.source, 'gm'), '$1.$2$3$4.$5')
  return new File([`WEBVTT\n\n${body}`], file.name.replace(/\.srt$/i, '.vtt'), {
    type: 'text/vtt',
  })
}
