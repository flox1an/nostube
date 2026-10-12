import type { NostrEvent } from 'nostr-tools'
import { buildVideoUpdate, type VideoUpdateInput } from '@nostube/core/video-lifecycle'
import { prepareSubtitleFile } from '@nostube/core/subtitle-utils'
import type { UploadedBlob } from '@nostube/core/video-publish'
import type { TranscodeSourceMeta } from '@nostube/core/video-transcode'
import type { UploadDeps } from './run-upload'
import type { VideoProbe } from './probe-video'
import i18n from '../i18n'

export interface EditSubtitle {
  id: string
  lang: string
  url?: string
  extra?: string[]
  file?: File
}
export interface VideoEditInput extends Omit<
  VideoUpdateInput,
  'video' | 'subtitles' | 'thumbnail'
> {
  file?: File
  /** Set when `file` is converted to MP4 before it is uploaded: what was read from it. */
  convert?: TranscodeSourceMeta
  thumbnail?: Blob | null
  subtitles?: EditSubtitle[]
}
interface CachedAsset {
  hash?: string
  uploaded?: UploadedBlob
  offset?: number
  prepared?: File
  converted?: File
  probe?: VideoProbe
}
/** Keyed by file identity: changing metadata never invalidates successful uploads. */
export type VideoEditCache = Map<Blob, CachedAsset>

export async function runVideoEdit(
  getCurrent: () => NostrEvent,
  pubkey: string,
  input: VideoEditInput,
  deps: UploadDeps,
  cache: VideoEditCache,
  onProgress: (done: number, total: number) => void = () => {},
  signal?: AbortSignal
) {
  // Author/coordinate checks precede expensive work and are repeated on the latest event at publish.
  buildVideoUpdate(getCurrent(), pubkey, { ...input, thumbnail: undefined, subtitles: undefined })
  const asset = (blob: Blob) => {
    let entry = cache.get(blob)
    if (!entry) {
      entry = {}
      cache.set(blob, entry)
    }
    return entry
  }
  const upload = async (key: Blob, blob: Blob, name: string, type: string) => {
    const entry = asset(key)
    entry.hash ??= await deps.hash(blob, onProgress, signal)
    entry.uploaded ??= await deps.upload({
      blob,
      name,
      type,
      sha256: entry.hash,
      onProgress,
      resumeFrom: entry.offset,
      onOffset: offset => {
        entry.offset = offset
      },
      signal,
    })
    return entry.uploaded
  }
  let video: VideoUpdateInput['video']
  if (input.file) {
    const entry = asset(input.file)
    if (input.convert) {
      entry.converted ??= await deps.convert(input.file, input.convert, onProgress, signal)
    }
    const file = entry.converted ?? input.file
    entry.probe ??= await deps.probe(file)
    const uploaded = await upload(file, file, file.name, file.type)
    video = {
      ...uploaded,
      sha256: asset(file).hash!,
      size: file.size,
      type: uploaded.type || file.type,
      width: entry.probe.width,
      height: entry.probe.height,
      duration: entry.probe.duration,
    }
  }
  let thumbnail: string | null | undefined
  if (input.thumbnail === null) thumbnail = null
  else if (input.thumbnail) {
    if (!input.thumbnail.type.startsWith('image/'))
      throw new Error(i18n.t('studio.errors.thumbnailType'))
    thumbnail = (
      await upload(
        input.thumbnail,
        input.thumbnail,
        input.thumbnail instanceof File ? input.thumbnail.name : 'thumbnail.jpg',
        input.thumbnail.type
      )
    ).url
  }
  const subtitles: VideoUpdateInput['subtitles'] = input.subtitles === undefined ? undefined : []
  for (const subtitle of input.subtitles ?? []) {
    if (!subtitle.lang)
      throw new Error(
        i18n.t('studio.errors.subtitleLanguage', { name: subtitle.file?.name ?? subtitle.url })
      )
    let url = subtitle.url
    if (subtitle.file) {
      const entry = asset(subtitle.file)
      entry.prepared ??= await prepareSubtitleFile(subtitle.file)
      url = (await upload(subtitle.file, entry.prepared, entry.prepared.name, 'text/vtt')).url
    }
    if (!url) throw new Error(i18n.t('studio.videos.assetMissing'))
    subtitles!.push({ url, lang: subtitle.lang, extra: subtitle.extra })
  }
  return deps.publish(
    buildVideoUpdate(getCurrent(), pubkey, { ...input, video, thumbnail, subtitles })
  )
}
