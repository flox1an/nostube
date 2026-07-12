import { VideoCardSkeleton } from '@/components/VideoCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Per-page Suspense skeletons. Each loader mirrors the layout of the
 * page it fronts so the lazy-chunk → first paint transition stays
 * visually stable. Feed pages with a `CategoryButtonBar` use
 * `<PageLoader />` from `./PageLoader`.
 */

const HORIZONTAL_GRID =
  'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
const VERTICAL_GRID =
  'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7'

function CategoryBarSkeleton() {
  return (
    <div className="sm:px-2">
      <div className="w-full overflow-x-auto scrollbar-hide sticky top-[env(safe-area-inset-top,0)] z-40 bg-background/80 backdrop-blur-md">
        <div className="flex gap-2 p-2 min-w-max">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn('h-8 rounded-full shrink-0', i === 0 ? 'w-12' : 'w-20')}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function HorizontalVideoGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <div className={HORIZONTAL_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} format="horizontal" />
      ))}
    </div>
  )
}

/** `/shorts` — sticky CategoryButtonBar over a vertical (portrait) grid. */
export function ShortsFeedPageLoader() {
  return (
    <div className="max-w-560 mx-auto">
      <CategoryBarSkeleton />
      <div className="sm:p-2">
        <div className={VERTICAL_GRID}>
          {Array.from({ length: 24 }).map((_, i) => (
            <VideoCardSkeleton key={i} format="vertical" tightGridGap />
          ))}
        </div>
      </div>
    </div>
  )
}

/** `/subscriptions` — mixed long-form + shorts grid, no category bar. */
export function SubscriptionsPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <HorizontalVideoGridSkeleton />
    </div>
  )
}

/** `/tag/:tag` — `#tag` heading + grid. */
export function HashtagPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-2">
      <div className="flex items-center gap-2 p-2">
        <Skeleton className="h-8 w-48" />
      </div>
      <HorizontalVideoGridSkeleton />
    </div>
  )
}

/** `/search` — query heading + filters trigger + grid. */
export function SearchPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <div className="flex flex-col gap-3 p-2 sm:flex-row sm:items-start sm:justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-24" />
      </div>
      <HorizontalVideoGridSkeleton />
    </div>
  )
}

/** `/liked-videos` — title + grid. */
export function LikedVideosPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <Skeleton className="h-8 w-48 mb-4" />
      <HorizontalVideoGridSkeleton />
    </div>
  )
}

/** `/history` — title row with "Clear" button + grid. */
export function HistoryPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <div className="p-2 flex justify-between items-center mb-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <HorizontalVideoGridSkeleton />
    </div>
  )
}

/** `/video-notes` — title + description + stacked note cards. */
export function VideoNotesPageLoader() {
  return (
    <div className="container mx-auto py-6 max-w-4xl px-4">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 flex gap-4">
            <Skeleton className="w-40 h-24 rounded-md shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** `/upload` — draft picker / upload form scaffold. */
export function UploadPageLoader() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="w-full h-48 rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}

/** `/playlists` — title + 2/3/4-col playlist card grid. */
export function GlobalPlaylistsPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-4 p-2">
      <Skeleton className="h-8 w-48 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-video rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** `/playlist/:nip19` — title + sort/edit controls + 3-col grid. */
export function SinglePlaylistPageLoader() {
  return (
    <div className="max-w-560 mx-auto p-8 flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-[180px] shrink-0" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  )
}

/** `/author/:nprofile` (and `/p/:nprofile`) — banner, profile card, tab strip, sections. */
export function AuthorPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <Skeleton className="w-full h-32 sm:h-48 md:h-56 rounded-lg" />
      <div className="flex items-start space-x-4 p-2 ml-6 -mt-16 sm:-mt-20 relative">
        <Skeleton className="w-24 h-24 rounded-full ring-2 ring-background shrink-0" />
        <div className="flex-1 min-w-0 space-y-2 mt-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-3/4 max-w-md" />
        </div>
      </div>
      <div className="p-2">
        <div className="w-full overflow-x-auto scrollbar-hide -mx-2 px-2 py-2">
          <div className="flex gap-2 min-w-max">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
            ))}
          </div>
        </div>
        <div className="mt-6 space-y-8">
          {Array.from({ length: 2 }).map((_, sec) => (
            <section key={sec} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="w-full overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 min-w-max">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-80 shrink-0">
                      <VideoCardSkeleton format="horizontal" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/** `/admin` — preset editor: stacked card sections + save button. */
export function AdminPageLoader() {
  return (
    <div className="max-w-560 mx-auto p-4">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  )
}

/** `/mp4-debug` — URL input + analyze button. */
export function Mp4DebugPageLoader() {
  return (
    <div className="container mx-auto py-8 max-w-7xl px-4 space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  )
}

/** `/short/:nevent` — fullscreen black backdrop with a 9:16 placeholder. */
export function ShortsVideoPageLoader() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <Skeleton className="w-full h-full max-w-md aspect-9/16" />
    </div>
  )
}

/** `*` — NotFound renders instantly; the fallback just holds the viewport. */
export function NotFoundLoader() {
  return <div className="min-h-screen" />
}
