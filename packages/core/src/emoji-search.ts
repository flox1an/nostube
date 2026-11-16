/** A Unicode emoji with the names it is found by. */
export interface UnicodeEmoji {
  unicode: string
  /** Shortcodes without colons, the first one is shown (`joy`, `+1`). */
  shortcodes: string[]
  label: string
  tags: string[]
}

let loading: Promise<UnicodeEmoji[]> | undefined

/**
 * All Unicode emoji (emojibase, English), in their standard order. Loaded on first use as a
 * separate chunk; skin tone variants and components are left out.
 */
export function loadUnicodeEmojis(): Promise<UnicodeEmoji[]> {
  loading ??= Promise.all([
    import('emojibase-data/en/compact.json'),
    import('emojibase-data/en/shortcodes/emojibase.json'),
  ]).then(
    ([{ default: data }, { default: codes }]) =>
      data
        .filter(emoji => emoji.group !== undefined && emoji.group !== 2)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(emoji => ({
          unicode: emoji.unicode,
          shortcodes: [codes[emoji.hexcode] ?? []].flat(),
          label: emoji.label,
          tags: emoji.tags ?? [],
        })),
    error => {
      loading = undefined
      throw error
    }
  )
  return loading
}

/**
 * How well `query` matches one of `names`, case-insensitive: 0 a name is the query, 1 a name
 * starts with it, 2 a word in a name does, 3 a name contains it; null no match.
 */
export function matchRank(query: string, names: readonly string[]): number | null {
  const q = query.toLowerCase()
  let best: number | null = null
  for (const raw of names) {
    const name = raw.toLowerCase()
    const rank =
      name === q
        ? 0
        : name.startsWith(q)
          ? 1
          : name.split(/[\s_-]+/).some(word => word.startsWith(q))
            ? 2
            : name.includes(q)
              ? 3
              : null
    if (rank !== null && (best === null || rank < best)) best = rank
  }
  return best
}

/**
 * The best `limit` matches of `query`: shortcodes and label before keywords, the shorter name
 * first within a rank (`:fir` → fire before firefighter), then emoji order.
 */
export function searchUnicodeEmojis(
  emojis: readonly UnicodeEmoji[],
  query: string,
  limit: number
): UnicodeEmoji[] {
  const hits: { emoji: UnicodeEmoji; rank: number }[] = []
  for (const emoji of emojis) {
    const named = matchRank(query, [...emoji.shortcodes, emoji.label])
    const tagged = named === null ? matchRank(query, emoji.tags) : null
    if (named !== null) hits.push({ emoji, rank: named })
    else if (tagged !== null) hits.push({ emoji, rank: 4 + tagged })
  }
  const q = query.toLowerCase()
  // The shortest name that holds the query: `:fir` → fire before first_place_medal.
  const length = (emoji: UnicodeEmoji) =>
    Math.min(
      ...[...emoji.shortcodes, emoji.label]
        .filter(name => name.toLowerCase().includes(q))
        .map(name => name.length),
      Infinity
    )
  return hits
    .sort((a, b) => a.rank - b.rank || length(a.emoji) - length(b.emoji))
    .slice(0, limit)
    .map(hit => hit.emoji)
}
