/**
 * The embed served by a nostube-server instance defaults to the creator's accent colour (the
 * instance config, `site.theme.accent`). The server build sets VITE_EMBED_INSTANCE; the embed
 * on nostu.be never asks, so it makes no extra request there. An explicit `?color=` wins.
 */
export const EMBED_ON_INSTANCE = import.meta.env.VITE_EMBED_INSTANCE === 'true'

/** The accent as six hex digits (no `#`), or null when there is none to use. */
export async function loadInstanceAccent(
  fetcher: typeof fetch = fetch,
  timeoutMs = 2000
): Promise<string | null> {
  try {
    const res = await fetcher('/api/config', {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const accent = ((await res.json()) as { site?: { theme?: { accent?: unknown } } }).site?.theme
      ?.accent
    return typeof accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.slice(1) : null
  } catch {
    return null
  }
}

/** Applies the instance accent unless the embed URL names a colour itself. */
export async function withInstanceAccent<T extends { accentColor: string }>(
  params: T,
  search: string = location.search
): Promise<T> {
  if (!EMBED_ON_INSTANCE || new URLSearchParams(search).has('color')) return params
  const accent = await loadInstanceAccent()
  return accent ? { ...params, accentColor: accent } : params
}
