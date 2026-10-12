import type { VideoEvent } from '@nostube/core/video-event'

/** The page of a video; `link` is its naddr/nevent. */
export const videoPath = (video: VideoEvent) => `/v/${video.link}`

/** The page listing the creator's videos with a `t` tag. */
export const tagPath = (tag: string) => `/t/${encodeURIComponent(tag)}`
