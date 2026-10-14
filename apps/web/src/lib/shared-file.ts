// A video shared into the installed app: public/share-target-sw.js stores it under this
// cache and key, then redirects to /upload?shared=1. Keep both names in sync with it.
export const SHARED_FILE_CACHE = 'nostube-shared-file'
export const SHARED_FILE_KEY = '/shared-file'

/** Takes the shared video out of the cache (it is removed once read); null when there is none. */
export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === 'undefined') return null
  const cache = await caches.open(SHARED_FILE_CACHE)
  const response = await cache.match(SHARED_FILE_KEY)
  if (!response) return null
  const blob = await response.blob()
  await cache.delete(SHARED_FILE_KEY)
  const name = decodeURIComponent(response.headers.get('X-File-Name') ?? '') || 'shared-video'
  return new File([blob], name, { type: blob.type || response.headers.get('Content-Type') || '' })
}
