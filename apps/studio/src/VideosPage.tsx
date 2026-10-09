import { lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      {banner}
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.videos.title')}</CardTitle>
          <CardDescription>{t('studio.videos.description')}</CardDescription>
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
