import { VideoCard, VideoCardSkeleton } from '@/components/VideoCard'
import { VideoEvent } from '@/utils/video-event'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { useCallback } from 'react'

interface VideoGridProps {
  videos: VideoEvent[]
  isLoading?: boolean
  showSkeletons?: boolean
  layoutMode?: 'auto' | 'horizontal' | 'vertical' // new prop, default to auto
}

export function VideoGrid({
  videos,
  isLoading,
  showSkeletons,
  layoutMode = 'auto',
}: VideoGridProps) {
  const width = useWindowWidth()

  // Determine number of columns for each type based on width
  const getCols = useCallback(
    (type: 'horizontal' | 'vertical') => {
      if (type === 'vertical') {
        if (width >= 1800) return 8
        if (width >= 1400) return 6
        if (width >= 1024) return 4
        if (width >= 768) return 3
        if (width >= 640) return 2
        return 1
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
    wideVideos = videos.filter(v => v.type === 'videos')
    portraitVideos = videos.filter(v => v.type === 'shorts')
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

  if (isLoading && showSkeletons && videos.length == 0) {
    // Show skeletons for both types if auto, else just one
    if (layoutMode === 'auto') {
      const wideCols = getCols('horizontal')
      const portraitCols = getCols('vertical')
      return (
        <div className="flex flex-col gap-8">
          {chunk(Array.from({ length: 24 }), wideCols).map((row, i) => (
            <div key={'wide-skel-' + i} className={`grid gap-6 ${gridColsClass(wideCols)}`}>
              {row.map((_, j) => (
                <VideoCardSkeleton key={j} format="horizontal" />
              ))}
            </div>
          ))}
          {chunk(Array.from({ length: 24 }), portraitCols).map((row, i) => (
            <div key={'portrait-skel-' + i} className={`grid gap-6 ${gridColsClass(portraitCols)}`}>
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
          'grid gap-6',
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

  if (videos.length === 0 && !isLoading) {
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
    // Interleave rows: wide, portrait, wide, portrait, ...
    const wideRows = chunk(wideVideos, getCols('horizontal'))
    const portraitRows = chunk(portraitVideos, getCols('vertical'))
    const maxRows = Math.max(wideRows.length, portraitRows.length)
    const rows: React.ReactNode[] = []
    for (let i = 0; i < maxRows; i++) {
      if (wideRows[i]) {
        rows.push(
          <div key={'wide-' + i} className={`grid gap-6 ${gridColsClass(getCols('horizontal'))}`}>
            {wideRows[i].map(video => (
              <VideoCard key={video.id} video={video} format="horizontal" />
            ))}
          </div>
        )
      }
      if (portraitRows[i]) {
        rows.push(
          <div key={'portrait-' + i} className={`grid gap-4 ${gridColsClass(getCols('vertical'))}`}>
            {portraitRows[i].map(video => (
              <VideoCard key={video.id} video={video} format="vertical" />
            ))}
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
  return (
    <div
      className={cn(
        'grid gap-6',
        isShort
          ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
          : isHorizontal
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6'
      )}
    >
      {videos.map(video => (
        <VideoCard key={video.id} video={video} format={cardFormat} />
      ))}
    </div>
  )
}
