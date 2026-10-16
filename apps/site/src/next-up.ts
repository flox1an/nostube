import { videoRef } from '@nostube/core/hidden-videos'
import type { VideoEvent } from '@nostube/core/video-event'

/**
 * What to offer after a video: the next one in the creator's selected works (the one after the
 * current video, or the first when the current is not among them), else the newest other video.
 * `videos` are the ones known so far; a selected entry that is not loaded is skipped.
 */
export function chooseNextVideo(
  videos: readonly VideoEvent[],
  current: Pick<VideoEvent, 'id' | 'kind' | 'pubkey' | 'identifier'>,
  selected: readonly string[]
): VideoEvent | undefined {
  const own = new Set([current.id, videoRef(current)])
  const known = new Map<string, VideoEvent>()
  for (const video of videos) {
    known.set(video.id, video)
    known.set(videoRef(video), video)
  }
  const at = selected.findIndex(ref => own.has(ref))
  const after = at === -1 ? selected : selected.slice(at + 1)
  for (const ref of after) {
    const video = known.get(ref)
    if (video && !own.has(video.id) && !own.has(videoRef(video))) return video
  }
  return videos.find(video => video.id !== current.id)
}
