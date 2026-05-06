import type { HlsVariantStream, VideoVariant } from '@/lib/video-processing'

export type UploadMediaAsset =
  | {
      kind: 'video'
      video: VideoVariant
      originalIndex: number
    }
  | {
      kind: 'hls'
      master: VideoVariant
      streams: HlsVariantStream[]
      originalIndex: number
      highestStream?: HlsVariantStream
    }

export function isHlsMasterVariant(video: VideoVariant): boolean {
  return video.mimeType === 'application/vnd.apple.mpegurl' && (video.hlsVariants?.length ?? 0) > 0
}

function getStreamQuality(stream: HlsVariantStream): number {
  const labelQuality = parseInt(stream.qualityLabel, 10)
  if (!Number.isNaN(labelQuality)) return labelQuality

  const [, height] = stream.dimension.split('x').map(Number)
  return Number.isFinite(height) ? height : 0
}

export function getHighestHlsStream(video: VideoVariant): HlsVariantStream | undefined {
  return video.hlsVariants
    ? [...video.hlsVariants].sort((a, b) => getStreamQuality(b) - getStreamQuality(a))[0]
    : undefined
}

export function getPublishableDimension(video: VideoVariant): string {
  return getHighestHlsStream(video)?.dimension || video.dimension
}

export function normalizeUploadMedia(videos: VideoVariant[]): UploadMediaAsset[] {
  return videos.map((video, originalIndex) => {
    if (isHlsMasterVariant(video)) {
      return {
        kind: 'hls' as const,
        master: video,
        streams: [...(video.hlsVariants ?? [])].sort(
          (a, b) => getStreamQuality(b) - getStreamQuality(a)
        ),
        originalIndex,
        highestStream: getHighestHlsStream(video),
      }
    }

    return {
      kind: 'video' as const,
      video,
      originalIndex,
    }
  })
}
