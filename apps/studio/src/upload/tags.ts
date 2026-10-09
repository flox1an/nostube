/** `Travel, #berlin  trip` to `['travel', 'berlin', 'trip']`: lower case, no `#`, no duplicates. */
export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map(tag => tag.replace(/^#+/, '').toLowerCase())
        .filter(Boolean)
    ),
  ]
}
