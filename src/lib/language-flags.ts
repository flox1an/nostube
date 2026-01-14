/**
 * Language code to country flag utilities.
 * Used for displaying language badges with flag emojis.
 */

/**
 * Map ISO-639-1 language codes to country codes for flag display.
 * Uses the most common country association for each language.
 */
export const languageToCountryCode: Record<string, string> = {
  en: 'US',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pt: 'BR',
  ru: 'RU',
  zh: 'CN',
  ja: 'JP',
  ko: 'KR',
  ar: 'SA',
  hi: 'IN',
  nl: 'NL',
  pl: 'PL',
  tr: 'TR',
  uk: 'UA',
  vi: 'VN',
  th: 'TH',
  sv: 'SE',
  da: 'DK',
  fi: 'FI',
  no: 'NO',
  cs: 'CZ',
  el: 'GR',
  he: 'IL',
  id: 'ID',
  ms: 'MY',
  ro: 'RO',
  hu: 'HU',
  sk: 'SK',
  bg: 'BG',
  hr: 'HR',
  sr: 'RS',
  sl: 'SI',
  et: 'EE',
  lv: 'LV',
  lt: 'LT',
  fa: 'IR',
  bn: 'BD',
  ta: 'IN',
  te: 'IN',
}

/**
 * Convert a country code (e.g., 'US') to a flag emoji.
 *
 * @example
 * countryCodeToFlag('US') // "🇺🇸"
 * countryCodeToFlag('DE') // "🇩🇪"
 */
export function countryCodeToFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

/**
 * Get flag emoji and uppercase code for a language.
 * Returns globe emoji if country not found.
 *
 * @example
 * getLanguageDisplay('en') // { flag: "🇺🇸", code: "EN" }
 * getLanguageDisplay('xyz') // { flag: "🌐", code: "XYZ" }
 */
export function getLanguageDisplay(langCode: string): { flag: string; code: string } {
  const upperCode = langCode.toUpperCase()
  const countryCode = languageToCountryCode[langCode.toLowerCase()]
  const flag = countryCode ? countryCodeToFlag(countryCode) : '🌐'
  return { flag, code: upperCode }
}
