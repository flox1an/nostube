import { lazy, Suspense, type ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import type { Draft } from './draft'

const HiddenVideosPicker = lazy(() => import('./HiddenVideosPicker'))

/** The creator's videos; a switch each hides one from the public site. */
export function VideosPage({
  draft,
  update,
  banner,
}: {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  banner: ReactNode
}) {
  return (
    <div className="space-y-6">
      {banner}
      <Card>
        <CardHeader>
          <CardTitle>Videos</CardTitle>
          <CardDescription>
            The site shows every video of your creators except the ones you switch off here. New
            uploads appear on their own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <HiddenVideosPicker
              hiddenText={draft.hiddenText}
              onChange={hiddenText => update({ hiddenText })}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
