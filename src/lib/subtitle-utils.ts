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
 * Common languages for the dropdown selector
 */
export const COMMON_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'id', name: 'Indonesian' },
  { code: 'cs', name: 'Czech' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'uk', name: 'Ukrainian' },
]

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
 * Get language name from code
 */
export function getLanguageName(code: string): string {
  if (!code) return ''
  const found = COMMON_LANGUAGES.find(l => l.code === code)
  if (found) return found.name

  // Fall back to langs library
  const entry =
    langs.where('1', code) ||
    langs.where('2', code) ||
    langs.where('2T', code) ||
    langs.where('2B', code) ||
    langs.where('3', code)
  return entry?.name || code
}

/**
 * Generate a unique ID for a subtitle
 */
export function generateSubtitleId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
