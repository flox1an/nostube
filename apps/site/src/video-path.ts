import type { VideoEvent } from '@nostube/core/video-event'

/** The page of a video; `link` is its naddr/nevent. */
export const videoPath = (video: VideoEvent) => `/v/${video.link}`
