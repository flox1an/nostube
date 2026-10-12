import type { VideoEvent } from './video-event'

/** Lower case without diacritics, so "Café", "CAFE" and "cafe" read the same. */
export const foldText = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * The videos whose text (by default title, description and tags, see `VideoEvent.searchText`)
 * contains every word of the query, in any order, case and diacritics ignored. Keeps the order of
 * `videos`; an empty query finds nothing.
 * ponytail: substring scan over the whole catalog, fine for a creator's few hundred videos; an
 * index (MiniSearch) once catalogs reach many thousands.
 */
export function searchVideos<V extends Pick<VideoEvent, 'searchText'>>(
  videos: readonly V[],
  query: string,
  textOf: (video: V) => string = video => video.searchText
): V[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return videos.filter(video => {
    const text = foldText(textOf(video))
    return words.every(word => text.includes(word))
  })
}
