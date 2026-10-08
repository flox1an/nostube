import { enUS, de, fr, es, ru } from 'date-fns/locale'
import type { Locale } from 'date-fns'

/**
 * Get the date-fns locale object based on the current i18n language code
 * @param languageCode - The i18n language code (e.g., 'en', 'de', 'fr', 'es')
 * @returns The corresponding date-fns Locale object
 */
export function getDateLocale(languageCode: string): Locale {
  switch (languageCode) {
    case 'de':
      return de
    case 'fr':
      return fr
    case 'es':
      return es
    case 'ru':
      return ru
    default:
      return enUS
  }
}
