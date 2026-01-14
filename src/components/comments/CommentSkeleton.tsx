/**
 * Comment Skeleton Component
 *
 * Loading placeholder for comments with appropriate sizing based on depth.
 */

import { Skeleton } from '@/components/ui/skeleton'

interface CommentSkeletonProps {
  depth?: number
}

export function CommentSkeleton({ depth = 0 }: CommentSkeletonProps) {
  const isRootComment = depth === 0
  const avatarSize = isRootComment ? 'h-10 w-10' : 'h-6 w-6'

  return (
    <div className="flex gap-3 pb-4">
      <Skeleton className={`${avatarSize} rounded-full shrink-0`} />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-14" />
        </div>
      </div>
    </div>
  )
}
