import { VideoCardSkeleton } from '@/components/VideoCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Shared loading skeleton for top-level pages that render a video grid
 * (Home / Subscriptions / Hashtag / etc.). Matches PageLoader's shape so
 * the transition between Suspense fallback and the page's own loading
 * state is visually seamless.
 */
export function PageLoader() {
  return (
    <div className="max-w-560 mx-auto">
      {/* Category bar skeleton */}
      <div className="sm:px-2">
        <div className="w-full overflow-x-auto scrollbar-hide sticky top-[env(safe-area-inset-top,0)] z-40 bg-background/80 backdrop-blur-md border-b">
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
      {/* Video grid skeleton */}
      <div className="sm:px-2">
        <div
          className={cn(
            'grid',
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
          )}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <VideoCardSkeleton key={i} format="horizontal" />
          ))}
        </div>
      </div>
    </div>
  )
}
