import { VideoCard, VideoCardSkeleton } from '@/components/VideoCard'
import { type VideoEvent } from '@/utils/video-event'
import { cn } from '@/lib/utils'
import { chunk } from '@/lib/array-utils'
import { Card, CardContent } from '@/components/ui/card'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { useCallback, useMemo } from 'react'
import { useAppContext } from '@/hooks'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const width = useWindowWidth()
  const { config } = useAppContext()

  // Filter out NSFW videos if nsfwFilter is 'hide' (default to 'hide' if not set)
  const nsfwFilter = config.nsfwFilter ?? 'hide'
  const filteredVideos = useMemo(() => {
    if (nsfwFilter === 'hide') {
      return videos.filter(video => !video.contentWarning)
    }
    return videos
  }, [videos, nsfwFilter])

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

  // Split videos by type for auto mode (memoized)
  // Also pre-compute index map for O(1) lookup instead of O(n) findIndex
  const { wideVideos, portraitVideos, portraitIndexMap } = useMemo(() => {
    if (layoutMode === 'auto') {
      const wide = filteredVideos.filter(v => v.type === 'videos')
      const portrait = filteredVideos.filter(v => v.type === 'shorts')
      // Pre-compute index map for O(1) lookup
      const indexMap = new Map<string, number>()
      portrait.forEach((v, i) => indexMap.set(v.id, i))
      return {
        wideVideos: wide,
        portraitVideos: portrait,
        portraitIndexMap: indexMap,
      }
    }
    return { wideVideos: [], portraitVideos: [], portraitIndexMap: new Map<string, number>() }
  }, [layoutMode, filteredVideos])

  // chunk function imported from @/lib/array-utils

  // Helper to map column count to Tailwind class (memoized)
  const gridColsClass = useMemo(
    () => (cols: number) => {
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
    },
    []
  )

  if (isLoading && showSkeletons && filteredVideos.length == 0) {
    // Show skeletons for both types if auto, else just one
    if (layoutMode === 'auto') {
      const wideCols = getCols('horizontal')
      const portraitCols = getCols('vertical')
      return (
        <div className="flex flex-col">
          {chunk(Array.from({ length: 24 }), wideCols).map((row, i) => (
            <div key={'wide-skel-' + i} className={`grid ${gridColsClass(wideCols)}`}>
              {row.map((_, j) => (
                <VideoCardSkeleton key={j} format="horizontal" />
              ))}
            </div>
          ))}
          {chunk(Array.from({ length: 24 }), portraitCols).map((row, i) => (
            <div key={'portrait-skel-' + i} className={`grid ${gridColsClass(portraitCols)}`}>
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
          'grid',
          isShort
            ? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
            : isHorizontal
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
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
              <p className="text-muted-foreground">{t('video.noVideosFound')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (layoutMode === 'auto') {
    // Debug: Log auto layout rendering (DEV only)
    if (import.meta.env.DEV && portraitVideos.length > 0) {
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
          <div key={'wide-' + i} className={`grid ${gridColsClass(getCols('horizontal'))}`}>
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
          <div key={'portrait-' + i} className={`grid ${gridColsClass(getCols('vertical'))}`}>
            {portraitRows[i].map(video => (
              <VideoCard
                key={video.id}
                video={video}
                format="vertical"
                playlistParam={playlistParam}
                allVideos={portraitVideos}
                videoIndex={portraitIndexMap.get(video.id)}
              />
            ))}
          </div>
        )
      }
    }

    // Add skeleton rows when loading more videos (pagination)
    if (isLoading && showSkeletons && filteredVideos.length > 0) {
      const wideCols = getCols('horizontal')
      const portraitCols = getCols('vertical')

      // Calculate how many items are in the last row to fill it up
      const wideItemsInLastRow = wideVideos.length % wideCols
      const portraitItemsInLastRow = portraitVideos.length % portraitCols

      // If last wide row is partial, fill it first
      if (wideItemsInLastRow > 0) {
        const skeletonsNeeded = wideCols - wideItemsInLastRow
        rows.push(
          <div key={`loading-wide-fill`} className={`grid ${gridColsClass(wideCols)}`}>
            {Array.from({ length: skeletonsNeeded }).map((_, j) => (
              <VideoCardSkeleton key={j} format="horizontal" />
            ))}
          </div>
        )
      }

      // Add 2 full rows of horizontal skeletons
      for (let i = 0; i < 2; i++) {
        rows.push(
          <div key={`loading-wide-${i}`} className={`grid ${gridColsClass(wideCols)}`}>
            {Array.from({ length: wideCols }).map((_, j) => (
              <VideoCardSkeleton key={j} format="horizontal" />
            ))}
          </div>
        )
      }

      // If last portrait row is partial, fill it first
      if (portraitItemsInLastRow > 0) {
        const skeletonsNeeded = portraitCols - portraitItemsInLastRow
        rows.push(
          <div key={`loading-portrait-fill`} className={`grid ${gridColsClass(portraitCols)}`}>
            {Array.from({ length: skeletonsNeeded }).map((_, j) => (
              <VideoCardSkeleton key={j} format="vertical" />
            ))}
          </div>
        )
      }

      // Add 2 full rows of portrait skeletons
      for (let i = 0; i < 2; i++) {
        rows.push(
          <div key={`loading-portrait-${i}`} className={`grid ${gridColsClass(portraitCols)}`}>
            {Array.from({ length: portraitCols }).map((_, j) => (
              <VideoCardSkeleton key={j} format="vertical" />
            ))}
          </div>
        )
      }
    }

    return <div className="flex flex-col">{rows}</div>
  }

  // fallback: old logic for explicit type
  const isShort = layoutMode === 'vertical'
  const isHorizontal = layoutMode === 'horizontal'
  const cardFormat = isShort ? 'vertical' : isHorizontal ? 'horizontal' : 'horizontal'

  // Debug: Log what we're passing to VideoCard for shorts (DEV only)
  if (import.meta.env.DEV && isShort && filteredVideos.length > 0) {
    console.log('[VideoGrid] Rendering shorts (vertical layout):', {
      layoutMode,
      isShort,
      filteredVideosCount: filteredVideos.length,
      willPassAllVideos: isShort,
      firstVideoTitle: filteredVideos[0]?.title,
    })
  }

  // Calculate number of skeleton items based on layout mode
  const cols = isShort ? getCols('vertical') : getCols('horizontal')
  let skeletonCount = 0

  if (isLoading && filteredVideos.length > 0) {
    // Calculate how many items are in the last row
    const itemsInLastRow = filteredVideos.length % cols
    // Fill the last row if partial
    const fillSkeletons = itemsInLastRow > 0 ? cols - itemsInLastRow : 0
    // Add 2 full rows of skeletons
    skeletonCount = fillSkeletons + cols * 2
  }

  return (
    <div
      className={cn(
        'grid',
        isShort
          ? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8'
          : isHorizontal
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
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
      {/* Add skeleton placeholders when loading more (pagination) */}
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <VideoCardSkeleton key={`loading-${i}`} format={cardFormat} />
      ))}
    </div>
  )
}
