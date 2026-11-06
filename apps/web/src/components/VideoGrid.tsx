import { VideoCard, VideoCardSkeleton } from '@/components/VideoCard'
import { type VideoEvent } from '@nostube/core/video-event'
import { cn } from '@/lib/utils'
import { chunk } from '@/lib/array-utils'
import { Card, CardContent } from '@nostube/widgets/components/card'
import { Button } from '@nostube/widgets/components/button'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react'
import {
  defaultRangeExtractor,
  measureElement,
  useWindowVirtualizer,
  type Range,
  type VirtualizerOptions,
} from '@tanstack/react-virtual'
import { useAppContext } from '@/hooks'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'

/**
 * Rows fetched eagerly at high priority. Lazy images are only dispatched
 * after layout, so on a busy main thread the first visible rows would
 * otherwise wait for the feed render storm to finish.
 */
const PRIORITY_ROWS = 2

/**
 * Rows kept mounted beyond the viewport in each direction. Covers Tab/Shift+Tab
 * into the neighbouring row and fast flings on mobile.
 */
const OVERSCAN = 3

/** Height of a card's padding plus title, author and stats below the thumbnail. */
const CARD_META_HEIGHT = 120

/** Tailwind `sm`: below it full-bleed shorts show their metadata on the thumbnail. */
const SM_BREAKPOINT = 640

/** What can hold focus inside a card (thumbnail, avatar and title links). */
const FOCUSABLE = 'a[href], button, [tabindex]:not([tabindex="-1"])'

type CardFormat = 'horizontal' | 'vertical'

/**
 * `[minWidth, columns]`, widest first. Auto layout keeps its own steps; the
 * explicit layouts keep the Tailwind breakpoints (md/lg/xl/2xl) of the former
 * CSS-only grid.
 */
const COLUMNS: Record<'auto' | 'explicit', Record<CardFormat, [number, number][]>> = {
  auto: {
    horizontal: [
      [2200, 6],
      [1400, 4],
      [1024, 3],
      [768, 2],
      [0, 1],
    ],
    // Always 2 columns for vertical videos on mobile
    vertical: [
      [1800, 8],
      [1400, 6],
      [1024, 4],
      [768, 3],
      [0, 2],
    ],
  },
  explicit: {
    horizontal: [
      [1536, 6],
      [1280, 4],
      [1024, 3],
      [768, 2],
      [0, 1],
    ],
    vertical: [
      [1536, 8],
      [1280, 6],
      [1024, 4],
      [768, 3],
      [0, 2],
    ],
  },
}

function columnsFor(mode: 'auto' | 'explicit', format: CardFormat, width: number) {
  return COLUMNS[mode][format].find(([minWidth]) => width >= minWidth)![1]
}

// Static class names so Tailwind picks them up.
function gridColsClass(cols: number) {
  switch (cols) {
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

interface GridRow {
  /** Stable across pagination; changes with the column count, which changes the row's contents. */
  key: string
  format: CardFormat
  cols: number
  videos: VideoEvent[]
  /** The full list this row was cut from; vertical cards hand it to the shorts player. */
  list: VideoEvent[]
  /** Index of this row's first card in `list`. */
  start: number
  priority: boolean
  /** Space below the row. Padding, not margin, so the row measurement includes it. */
  spacing?: string
}

function toRows(
  list: VideoEvent[],
  format: CardFormat,
  cols: number,
  priorityRows: number
): GridRow[] {
  return chunk(list, cols).map((videos, i) => ({
    key: `${format}-${cols}-${videos[0].id}`,
    format,
    cols,
    videos,
    list,
    start: i * cols,
    priority: i < priorityRows,
  }))
}

// Measured row heights by row key, so a remounted grid (back navigation)
// lays out with real heights and the restored scroll position lands on the
// same rows.
// ponytail: unbounded for the session's lifetime like ScrollToTop's map; add
// an LRU cap if sessions ever scroll through tens of thousands of rows.
const rowHeights = new Map<string, number>()

const measureRow: VirtualizerOptions<Window, HTMLDivElement>['measureElement'] = (
  element,
  entry,
  instance
) => {
  const height = measureElement(element, entry, instance)
  const key = element.dataset.rowKey
  if (key && height > 0) rowHeights.set(key, height)
  return height
}

interface VideoGridProps {
  videos: VideoEvent[]
  isLoading?: boolean
  showSkeletons?: boolean
  layoutMode?: 'auto' | 'horizontal' | 'vertical' // new prop, default to auto
  playlistParam?: string
  /** Message shown when there are zero videos and no error. Defaults to a generic "no videos" copy. */
  emptyMessage?: string
  /** Optional recovery action (e.g. "Clear filters") rendered under emptyMessage. */
  emptyAction?: ReactNode
  /** True when the most recent retrieval attempt failed and produced no videos. */
  error?: boolean
  /** Retries the failed retrieval. Required to show a Retry action alongside the error state. */
  onRetry?: () => void
  /** Grid cards render edge-to-edge with square corners below `sm` (see VideoCard). */
  fullBleed?: boolean
}

/**
 * Rows are virtualized against the window scroll: only rows near the viewport
 * are mounted, while the container keeps the full height so the pagination
 * sentinel after the grid and scroll restoration keep working.
 */
export function VideoGrid({
  videos,
  isLoading,
  showSkeletons,
  layoutMode = 'auto',
  playlistParam,
  emptyMessage,
  emptyAction,
  error = false,
  onRetry,
  fullBleed = false,
}: VideoGridProps) {
  const { t } = useTranslation()
  const width = useWindowWidth()
  const { config } = useAppContext()

  // A public event without a safe playable source is retained in the event
  // store, but must not create a broken card in a global grid.
  const nsfwFilter = config.nsfwFilter ?? 'hide'
  const filteredVideos = useMemo(
    () =>
      videos.filter(
        video =>
          video.mediaSourceStatus !== 'requires-hash-resolution' &&
          video.mediaSourceStatus !== 'unavailable' &&
          (nsfwFilter !== 'hide' || !video.contentWarning)
      ),
    [videos, nsfwFilter]
  )

  const rows = useMemo(() => {
    if (layoutMode !== 'auto') {
      const isShort = layoutMode === 'vertical'
      const explicitRows = toRows(
        filteredVideos,
        layoutMode,
        columnsFor('explicit', layoutMode, width),
        PRIORITY_ROWS
      )
      // The former single grid had a row gap here; keep it between rows.
      return isShort && fullBleed
        ? explicitRows.map(row => ({ ...row, spacing: 'pb-0.5 sm:pb-0' }))
        : explicitRows
    }

    const wideRows = toRows(
      filteredVideos.filter(v => v.type === 'videos'),
      'horizontal',
      columnsFor('auto', 'horizontal', width),
      PRIORITY_ROWS
    )
    const portraitRows = toRows(
      filteredVideos.filter(v => v.type === 'shorts'),
      'vertical',
      columnsFor('auto', 'vertical', width),
      wideRows.length === 0 ? PRIORITY_ROWS : 0
    )

    // Interleave rows: 2 wide rows per 1 portrait row
    const interleaved: GridRow[] = []
    let wideIdx = 0
    let portraitIdx = 0
    while (wideIdx < wideRows.length || portraitIdx < portraitRows.length) {
      for (let r = 0; r < 2 && wideIdx < wideRows.length; r++, wideIdx++) {
        interleaved.push(wideRows[wideIdx])
      }
      if (portraitIdx < portraitRows.length) {
        const row = portraitRows[portraitIdx++]
        // Full-bleed portrait cards drop their padding on mobile; keep a gap before a wide row.
        interleaved.push(
          fullBleed && wideIdx < wideRows.length ? { ...row, spacing: 'pb-6 sm:pb-0' } : row
        )
      }
    }
    return interleaved
  }, [layoutMode, filteredVideos, width, fullBleed])

  // Document offset and width of the list. Content above the grid (headers,
  // tabs) can load late, so re-read whenever the page or the list resizes.
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null)
  const [listBox, setListBox] = useState({ top: 0, width: 0 })
  useLayoutEffect(() => {
    if (!listElement) return
    const update = () => {
      const rect = listElement.getBoundingClientRect()
      const top = rect.top + window.scrollY
      setListBox(prev =>
        prev.top === top && prev.width === rect.width ? prev : { top, width: rect.width }
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(document.body)
    observer.observe(listElement)
    return () => observer.disconnect()
  }, [listElement])

  // Keyboard focus survives virtualization: the focused card's row stays
  // mounted when it scrolls out of the window, and a column change (which
  // rebuilds every row and remounts the cards) refocuses the same card.
  // Without both, focus drops to <body>.
  const focusedCard = useRef<{ videoId: string; focusable: number; element: Element } | null>(null)
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    const rowElement = event.target.closest<HTMLElement>('[data-row-key]')
    const row = rowElement ? rows[Number(rowElement.dataset.index)] : undefined
    // A row's grid children are its cards, in `row.videos` order.
    const cards = Array.from(rowElement?.firstElementChild?.children ?? [])
    const cardIndex = cards.findIndex(card => card.contains(event.target))
    focusedCard.current =
      row && cardIndex !== -1
        ? {
            videoId: row.videos[cardIndex].id,
            // -1: the card root itself holds focus.
            focusable: Array.from(cards[cardIndex].querySelectorAll(FOCUSABLE)).indexOf(
              event.target
            ),
            element: event.target,
          }
        : null
  }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    // A null relatedTarget also comes from removing the focused node (some
    // browsers fire blur then), so only focus landing elsewhere clears it.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
      focusedCard.current = null
    }
  }
  const focusedRowIndex = useCallback(() => {
    const videoId = focusedCard.current?.videoId
    if (videoId === undefined) return -1
    return rows.findIndex(row => row.videos.some(v => v.id === videoId))
  }, [rows])
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      const focused = focusedRowIndex()
      if (focused === -1 || indexes.includes(focused)) return indexes
      return [...indexes, focused].sort((a, b) => a - b)
    },
    [focusedRowIndex]
  )
  useLayoutEffect(() => {
    const focused = focusedCard.current
    // Refocus only when the focused node was remounted and focus fell to <body>.
    if (!focused || focused.element.isConnected || !listElement) return
    if (document.activeElement && document.activeElement !== document.body) return
    const index = focusedRowIndex()
    if (index === -1) return
    const cardIndex = rows[index].videos.findIndex(v => v.id === focused.videoId)
    const card = listElement.querySelector(`[data-index="${index}"]`)?.firstElementChild?.children[
      cardIndex
    ]
    const target =
      focused.focusable === -1 ? card : card?.querySelectorAll(FOCUSABLE)[focused.focusable]
    if (target instanceof HTMLElement) target.focus({ preventScroll: true })
  }, [rows, listElement, focusedRowIndex])

  const getItemKey = useCallback((index: number) => rows[index].key, [rows])
  const listWidth = listBox.width || width
  const virtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rows.length,
    getItemKey,
    estimateSize: index => {
      const row = rows[index]
      const cached = rowHeights.get(row.key)
      if (cached !== undefined) return cached
      const cardWidth = listWidth / row.cols
      if (row.format === 'horizontal') return (cardWidth * 9) / 16 + CARD_META_HEIGHT
      const overlayMeta = fullBleed && width < SM_BREAKPOINT
      return cardWidth * 1.5 + (overlayMeta ? 0 : CARD_META_HEIGHT)
    },
    measureElement: measureRow,
    rangeExtractor,
    overscan: OVERSCAN,
    scrollMargin: listBox.top,
  })

  if (isLoading && showSkeletons && filteredVideos.length == 0) {
    // Show skeletons for both types if auto, else just one
    if (layoutMode === 'auto') {
      const wideCols = columnsFor('auto', 'horizontal', width)
      const portraitCols = columnsFor('auto', 'vertical', width)
      return (
        <div className="flex flex-col">
          {chunk(Array.from({ length: 24 }), wideCols).map((row, i) => (
            <div key={'wide-skel-' + i} className={`grid ${gridColsClass(wideCols)}`}>
              {row.map((_, j) => (
                <VideoCardSkeleton key={j} format="horizontal" fullBleed={fullBleed} />
              ))}
            </div>
          ))}
          {chunk(Array.from({ length: 24 }), portraitCols).map((row, i) => (
            <div
              key={'portrait-skel-' + i}
              className={cn('grid', gridColsClass(portraitCols), fullBleed && 'gap-0.5 sm:gap-0')}
            >
              {row.map((_, j) => (
                <VideoCardSkeleton key={j} format="vertical" fullBleed={fullBleed} />
              ))}
            </div>
          ))}
        </div>
      )
    }
    const isShort = layoutMode === 'vertical'
    return (
      <div
        className={cn(
          'grid',
          gridColsClass(columnsFor('explicit', layoutMode, width)),
          isShort && fullBleed && 'gap-0.5 sm:gap-0'
        )}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <VideoCardSkeleton key={i} format={layoutMode} fullBleed={fullBleed} />
        ))}
      </div>
    )
  }

  if (filteredVideos.length === 0 && !isLoading) {
    if (error) {
      return (
        <div className="col-span-full">
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <div className="max-w-sm mx-auto space-y-4">
                <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-muted-foreground">{t('video.networkError')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('video.networkErrorDescription')}
                </p>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    {t('common.retry')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }
    return (
      <div className="col-span-full">
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <p className="text-muted-foreground">{emptyMessage ?? t('video.noVideosFound')}</p>
              {emptyAction}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div
      ref={setListElement}
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {virtualizer.getVirtualItems().map(item => {
        const row = rows[item.index]
        const isShort = row.format === 'vertical'
        return (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            data-row-key={row.key}
            className={cn('absolute top-0 left-0 w-full', row.spacing)}
            style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
          >
            <div
              className={cn(
                'grid',
                gridColsClass(row.cols),
                isShort && fullBleed && 'gap-0.5 sm:gap-0'
              )}
            >
              {row.videos.map((video, j) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  format={row.format}
                  playlistParam={playlistParam}
                  allVideos={isShort ? row.list : undefined}
                  videoIndex={isShort ? row.start + j : undefined}
                  fullBleed={fullBleed}
                  priority={row.priority}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
