import type { EventTemplate } from 'nostr-tools'
import { waitForMirrors } from '../api'
import i18n from '../i18n'

/** Every media URL is replaced only after its hash has a confirmed public copy. */
export async function mirrorMedia(
  template: EventTemplate,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<EventTemplate> {
  const tags = template.tags.map(tag => [...tag])
  const media: { tag: string[]; index: number; prefix: string; hash: string }[] = []
  for (const tag of tags) {
    const fields =
      tag[0] === 'imeta'
        ? tag.slice(1).flatMap((field, index) => {
            const prefix = ['url ', 'image ', 'thumb ', 'fallback '].find(p => field.startsWith(p))
            return prefix ? [{ index: index + 1, prefix, url: field.slice(prefix.length) }] : []
          })
        : ['url', 'image', 'thumb', 'text-track'].includes(tag[0]) && tag[1]
          ? [{ index: 1, prefix: '', url: tag[1] }]
          : []
    for (const { index, prefix, url } of fields) {
      const filename = new URL(url).pathname.split('/').pop() ?? ''
      const hash = /^([a-f0-9]{64})(?:\.[^/]*)?$/i.exec(filename)?.[1].toLowerCase()
      if (!hash) throw new Error(i18n.t('studio.videos.assetMissing'))
      media.push({ tag, index, prefix, hash })
    }
  }
  const hashes = [...new Set(media.map(field => field.hash))]
  if (hashes.length === 0) throw new Error(i18n.t('studio.videos.assetMissing'))
  const urls = await waitForMirrors(hashes, onProgress, signal)
  signal?.throwIfAborted()
  for (const { tag, index, prefix, hash } of media) {
    if (!urls[hash]) throw new Error(i18n.t('studio.videos.assetMissing'))
    tag[index] = `${prefix}${urls[hash]}`
  }
  return { ...template, tags }
}
