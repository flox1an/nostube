import { type BlobDescriptor } from '@/lib/blossom-auth'
import { Check, ExternalLink } from 'lucide-react'
import { Badge } from '@nostube/widgets/components/badge'
import { Label } from '@nostube/widgets/components/label'
import { formatBlobUrl } from '@/lib/utils'

export interface UploadServerProps {
  /** The input method being used */
  inputMethod: 'file' | 'url'
  /** Current upload/processing state */
  uploadState: 'initial' | 'uploading' | 'finished'
  /** Blobs that were uploaded (for file uploads) */
  uploadedBlobs?: BlobDescriptor[]
  /** Blobs that were mirrored */
  mirroredBlobs?: BlobDescriptor[]
  /** Show the component even if no blobs are present */
  forceShow?: boolean
}

export function UploadServer({
  inputMethod,
  uploadState: _uploadState,
  uploadedBlobs = [],
  mirroredBlobs = [],
  forceShow = false,
}: UploadServerProps) {
  // Determine if we should show the component
  const shouldShow =
    forceShow || inputMethod === 'file' || (inputMethod === 'url' && mirroredBlobs.length > 0)

  if (!shouldShow) {
    return null
  }

  return (
    <div className="flex flex-col">
      {/* Show uploaded blobs for file uploads */}
      {inputMethod === 'file' && uploadedBlobs.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Uploaded to...</Label>
          <ul className="flex flex-col gap-1">
            {uploadedBlobs.map(blob => (
              <li key={blob.url} className="flex items-center gap-2">
                <Badge variant="secondary">{formatBlobUrl(blob.url)}</Badge>
                <Check className="w-5 h-5 text-green-500" />
                <a
                  href={blob.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open uploaded file URL"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Show mirrored blobs for both file uploads and URL mirroring */}
      {mirroredBlobs.length > 0 && (
        <div
          className={`flex flex-col gap-2 ${inputMethod === 'file' && uploadedBlobs.length > 0 ? 'mt-4' : ''}`}
        >
          <Label>{inputMethod === 'url' ? 'Mirrored from URL to...' : 'Mirrored to...'}</Label>
          <ul className="flex flex-col gap-1">
            {mirroredBlobs.map(blob => (
              <li key={blob.url} className="flex items-center gap-2">
                <Badge variant="secondary">{formatBlobUrl(blob.url)}</Badge>
                <Check className="w-5 h-5 text-green-500" />
                <a
                  href={blob.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open mirrored file URL"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Progress spinner while processing 
      maybe not needed anymore due to chunked upload progress indicator
      {uploadState === 'uploading' && (
        <div className="flex items-center gap-2 mt-4">
          <Loader2 className="animate-spin h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">
            {inputMethod === 'file' ? 'Uploading...' : 'Processing...'}
          </span>
        </div>
      )}
        */}
    </div>
  )
}
