import { VideoMetadata } from './VideoMetadata'
import { BlobDescriptor } from 'blossom-client-sdk'

interface VideoPreviewProps {
  inputMethod: 'file' | 'url'
  uploadedBlobs: BlobDescriptor[]
  videoUrl?: string
  dimension?: string
  sizeMB?: number
  duration?: number
  videoCodec?: string
  audioCodec?: string
}

export function VideoPreview({
  inputMethod,
  uploadedBlobs,
  videoUrl,
  dimension,
  sizeMB,
  duration,
  videoCodec,
  audioCodec,
}: VideoPreviewProps) {
  const hasVideo =
    (uploadedBlobs && uploadedBlobs.length > 0) || (inputMethod === 'url' && videoUrl)

  if (!hasVideo) {
    return null
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      <div className="w-full">
        <video
          controls
          className="w-full rounded-lg border shadow max-h-80"
          poster={undefined}
          crossOrigin="anonymous"
        >
          {/* Main video source - either from URL or uploaded file */}
          <source src={inputMethod === 'url' ? videoUrl : uploadedBlobs[0]?.url} />
          {/* Fallback sources if more than one blob exists (only for uploaded files) */}
          {inputMethod === 'file' &&
            uploadedBlobs
              .slice(1)
              .map((blob, idx) => <source key={blob.url || idx} src={blob.url} />)}
          Your browser does not support the video tag.
        </video>
      </div>
      <div>
        <VideoMetadata
          dimension={dimension}
          sizeMB={sizeMB}
          duration={duration}
          videoCodec={videoCodec}
          audioCodec={audioCodec}
          inputMethod={inputMethod}
        />
      </div>
    </div>
  )
}
