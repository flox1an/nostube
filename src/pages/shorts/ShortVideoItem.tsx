/**
 * Short Video Item Component
 *
 * Renders only the thumbnail/poster background for a slide in the shorts deck.
 * All interactive chrome (action buttons, author info, comments sheet) has been
 * extracted to ShortVideoOverlay, which is rendered at a higher z-index in
 * ShortsVideoPage so it stays above the singleton <video> element on all
 * platforms including iOS.
 */
import { memo, useMemo, useCallback } from 'react'
import { type VideoEvent } from '@/utils/video-event'
import { useAppContext } from '@/hooks'
import { useImageCascade } from '@/hooks/useImageCascade'
import { useValidUrl } from '@/hooks/useValidUrl'
import { UserBlossomServersModel } from 'applesauce-common/models'
import { useEventModel } from 'applesauce-react/hooks'

export interface ShortVideoItemProps {
  video: VideoEvent
  isActive: boolean
  registerIntersectionRef?: (element: HTMLDivElement | null) => void
}

function dimensionsToAspectRatio(dimensions?: string): number | null {
  if (!dimensions) return null
  const match = /^(\d+)x(\d+)$/i.exec(dimensions.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return width / height
}

function maxWidthForAspectRatio(aspectRatio: number | null): string {
  if (!aspectRatio) return 'calc(100vh * 9 / 16)'
  if (aspectRatio >= 0.9 && aspectRatio <= 1.1) return '85vh'
  if (aspectRatio > 1.1) return '95vh'
  return 'calc(100vh * 9 / 16)'
}

// Memoized component to prevent re-renders when props haven't changed.
export const ShortVideoItem = memo(
  function ShortVideoItem({ video, isActive, registerIntersectionRef }: ShortVideoItemProps) {
    const { config } = useAppContext()

    // Resolve thumbnail URL — owner's Blossom servers first, then user's config servers.
    const rawOwnerServersResult = useEventModel(
      UserBlossomServersModel,
      video.pubkey ? [video.pubkey] : null
    )
    const rawOwnerServers = useMemo(() => rawOwnerServersResult ?? [], [rawOwnerServersResult])
    const allBlossomServers = useMemo(() => {
      const ownerServers = rawOwnerServers.map(url => url.toString())
      const configServers = config.blossomServers?.map(s => s.url) ?? []
      return [...ownerServers, ...configServers]
    }, [rawOwnerServers, config.blossomServers])

    const { validUrl: thumbnailUrl } = useValidUrl({
      urls: video.images,
      blossomServers: allBlossomServers,
      resourceType: 'image',
      enabled: true,
    })

    const thumbnailCascade = useImageCascade({ src: thumbnailUrl, variant: 'preview' })

    const aspectRatio = useMemo(() => dimensionsToAspectRatio(video.dimensions), [video.dimensions])
    const maxWidth = useMemo(() => maxWidthForAspectRatio(aspectRatio), [aspectRatio])

    const handleRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        registerIntersectionRef?.(node)
      },
      [registerIntersectionRef]
    )

    return (
      // h-full instead of h-screen: the slide wrapper is `absolute inset-0` inside the
      // fixed ShortsVideoPage container, so h-full correctly matches the visual viewport.
      // Using h-screen (100vh) on iOS Safari can exceed the actual visual height when the
      // browser toolbar is visible, leaving a gap at the bottom.
      <div
        ref={handleRootRef}
        data-video-id={video.id}
        className="h-full w-full flex items-center justify-center bg-black"
        style={{ contain: 'layout style paint' }}
      >
        <div className="relative w-full h-full flex flex-col md:flex-row items-center justify-center">
          <div className="relative w-full md:flex-1 h-full flex items-center justify-center bg-black">
            <div
              className="relative w-full h-full"
              style={aspectRatio !== null && aspectRatio < 1.0 ? undefined : { maxWidth }}
            >
              {video.contentWarning && !isActive && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white drop-shadow-lg">
                      Content warning
                    </div>
                    <div className="text-base font-semibold text-white drop-shadow-lg mt-4">
                      {video.contentWarning}
                    </div>
                  </div>
                </div>
              )}
              <div className="relative w-full h-full">
                {thumbnailCascade.src && (
                  <div className="absolute inset-0 overflow-hidden bg-black flex items-center justify-center">
                    <img
                      src={thumbnailCascade.src}
                      alt={video.title}
                      className={`w-full h-full ${aspectRatio !== null && aspectRatio < 1.0 ? 'object-cover' : 'object-contain'}`}
                      loading={isActive ? 'eager' : 'lazy'}
                      referrerPolicy="no-referrer"
                      onError={thumbnailCascade.onError}
                      onLoad={thumbnailCascade.onLoad}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  (prevProps, nextProps) =>
    prevProps.video.id === nextProps.video.id && prevProps.isActive === nextProps.isActive
)
