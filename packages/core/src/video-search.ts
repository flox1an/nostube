/** Letter and digit runs, lower case without diacritics: "Café-Tour" → ["cafe", "tour"]. */
const terms = (text: string): string[] =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{Alphabetic}\p{N}]+/gu) ?? []

/** A NIP-50 extension (`include:spam`, `language:en`): the relay drops it, so does the check. */
const EXTENSION = /^[a-z0-9_-]+:/

/**
 * Whether `title` alone matches a search the way the instance relay matches its index: every
 * term of the query (letter and digit runs, extensions dropped) starts a word of the title, in
 * any order, case and diacritics ignored. No terms match nothing. For locked videos, which may be
 * found by their title only.
 */
export function titleMatchesSearch(title: string, query: string): boolean {
  const wanted = query
    .split(/\s+/)
    .filter(word => !EXTENSION.test(word))
    .flatMap(terms)
  const words = terms(title)
  return wanted.length > 0 && wanted.every(term => words.some(word => word.startsWith(term)))
}
