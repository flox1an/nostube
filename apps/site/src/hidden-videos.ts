import type { VideoEvent } from '@nostube/core/video-event'

/** True for a video the creator hid: listed by event id or by `<kind>:<pubkey>:<d>`. */
export function isHiddenVideo(video: VideoEvent, hidden: readonly string[]): boolean {
  if (hidden.length === 0) return false
  if (hidden.includes(video.id)) return true
  return (
    video.identifier !== undefined &&
    hidden.includes(`${video.kind}:${video.pubkey}:${video.identifier}`)
  )
}
