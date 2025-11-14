import { VideoCard, VideoCardSkeleton } from '@/components/VideoCard'
import { type VideoEvent } from '@/utils/video-event'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { useCallback, useMemo } from 'react'
import { useAppContext } from '@/hooks'

interface VideoGridProps {
  videos: VideoEvent[]
  isLoading?: boolean
  showSkeletons?: boolean
  layoutMode?: 'auto' | 'horizontal' | 'vertical' // new prop, default to auto
  playlistParam?: string
}

export function VideoGrid({
  videos,
  isLoading,
  showSkeletons,
  layoutMode = 'auto',
  playlistParam,
}: VideoGridProps) {
  const width = useWindowWidth()
  const { config } = useAppContext()

  // Filter out NSFW videos if nsfwFilter is 'hide'
  const filteredVideos = useMemo(() => {
    if (config.nsfwFilter === 'hide') {
      return videos.filter(video => !video.contentWarning)
    }
    return videos
  }, [videos, config.nsfwFilter])

  // Determine number of columns for each type based on width
  const getCols = useCallback(
    (type: 'horizontal' | 'vertical') => {
      if (type === 'vertical') {
        if (width >= 1800) return 8
        if (width >= 1400) return 6
        if (width >= 1024) return 4
        if (width >= 768) return 3
        // Always show 2 columns for vertical videos on mobile
        return 2
      } else {
        if (width >= 2200) return 6
        if (width >= 1400) return 4
        if (width >= 1024) return 3
        if (width >= 768) return 2
        return 1
      }
    },
    [width]
  )

  // Split videos by type for auto mode
  let wideVideos: VideoEvent[] = []
  let portraitVideos: VideoEvent[] = []
  if (layoutMode === 'auto') {
    wideVideos = filteredVideos.filter(v => v.type === 'videos')
    portraitVideos = filteredVideos.filter(v => v.type === 'shorts')
  }

  // Helper to chunk array into rows
  function chunk<T>(arr: T[], size: number): T[][] {
    const res: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size))
    }
    return res
  }

  // Helper to map column count to Tailwind class
  const gridColsClass = (cols: number) => {
    switch (cols) {
      case 1:
        return 'grid-cols-1'
      case 2:
        return 'grid-cols-2'
      case 3:
        return 'grid-cols-3'
      case 4:
        return 'grid-cols-4'
      case 6:
        return 'grid-cols-6'
      case 8:
        return 'grid-cols-8'
      default:
        return 'grid-cols-1'
    }
  }

  if (isLoading && showSkeletons && filteredVideos.length == 0) {
    // Show skeletons for both types if auto, else just one
    if (layoutMode === 'auto') {
      const wideCols = getCols('horizontal')
      const portraitCols = getCols('vertical')
      return (
        <div className="flex flex-col gap-4">
          {chunk(Array.from({ length: 24 }), wideCols).map((row, i) => (
            <div key={'wide-skel-' + i} className={`grid gap-4 ${gridColsClass(wideCols)}`}>
              {row.map((_, j) => (
                <VideoCardSkeleton key={j} format="horizontal" />
              ))}
            </div>
          ))}
          {chunk(Array.from({ length: 24 }), portraitCols).map((row, i) => (
            <div key={'portrait-skel-' + i} className={`grid gap-4 ${gridColsClass(portraitCols)}`}>
              {row.map((_, j) => (
                <VideoCardSkeleton key={j} format="vertical" />
              ))}
            </div>
          ))}
        </div>
      )
    }
    // fallback to old logic for non-auto
    const isShort = layoutMode === 'vertical'
    const isHorizontal = layoutMode === 'horizontal'
    const cardFormat = isShort ? 'vertical' : isHorizontal ? 'horizontal' : 'horizontal'
    return (
      <div
        className={cn(
          'grid gap-4',
          isShort
            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3  lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
            : isHorizontal
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6'
        )}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <VideoCardSkeleton key={i} format={cardFormat} />
        ))}
      </div>
    )
  }

  if (filteredVideos.length === 0 && !isLoading) {
    return (
      <div className="col-span-full">
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-6">
              <p className="text-muted-foreground">No results found. Try another relay?</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (layoutMode === 'auto') {
    // Debug: Log auto layout rendering
    if (portraitVideos.length > 0) {
      console.log('[VideoGrid] Rendering auto layout with shorts:', {
        layoutMode,
        wideVideosCount: wideVideos.length,
        portraitVideosCount: portraitVideos.length,
        firstPortraitTitle: portraitVideos[0]?.title,
      })
    }

    // Interleave rows: wide, portrait, wide, portrait, ...
    const wideRows = chunk(wideVideos, getCols('horizontal'))
    const portraitRows = chunk(portraitVideos, getCols('vertical'))
    const maxRows = Math.max(wideRows.length, portraitRows.length)
    const rows: React.ReactNode[] = []
    for (let i = 0; i < maxRows; i++) {
      if (wideRows[i]) {
        rows.push(
          <div key={'wide-' + i} className={`grid gap-4 ${gridColsClass(getCols('horizontal'))}`}>
            {wideRows[i].map(video => (
              <VideoCard
                key={video.id}
                video={video}
                format="horizontal"
                playlistParam={playlistParam}
              />
            ))}
          </div>
        )
      }
      if (portraitRows[i]) {
        rows.push(
          <div key={'portrait-' + i} className={`grid gap-4 ${gridColsClass(getCols('vertical'))}`}>
            {portraitRows[i].map(video => {
              const videoIndex = portraitVideos.findIndex(v => v.id === video.id)
              return (
                <VideoCard
                  key={video.id}
                  video={video}
                  format="vertical"
                  playlistParam={playlistParam}
                  allVideos={portraitVideos}
                  videoIndex={videoIndex}
                />
              )
            })}
          </div>
        )
      }
    }
    return <div className="flex flex-col gap-8">{rows}</div>
  }

  // fallback: old logic for explicit type
  const isShort = layoutMode === 'vertical'
  const isHorizontal = layoutMode === 'horizontal'
  const cardFormat = isShort ? 'vertical' : isHorizontal ? 'horizontal' : 'horizontal'

  // Debug: Log what we're passing to VideoCard for shorts
  if (isShort && filteredVideos.length > 0) {
    console.log('[VideoGrid] Rendering shorts (vertical layout):', {
      layoutMode,
      isShort,
      filteredVideosCount: filteredVideos.length,
      willPassAllVideos: isShort,
      firstVideoTitle: filteredVideos[0]?.title,
    })
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        isShort
          ? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
          : isHorizontal
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6'
      )}
    >
      {filteredVideos.map((video, index) => (
        <VideoCard
          key={video.id}
          video={video}
          format={cardFormat}
          playlistParam={playlistParam}
          allVideos={isShort ? filteredVideos : undefined}
          videoIndex={isShort ? index : undefined}
        />
      ))}
    </div>
  )
}
