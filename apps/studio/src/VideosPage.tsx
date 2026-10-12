import { lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { hashFor } from './route'
import { ScheduledVideos } from './ScheduledVideos'

const HiddenVideosPicker = lazy(() => import('./HiddenVideosPicker'))

/** The creator's videos; hiding one applies to the public site at once, so there is no save bar. */
export function VideosPage({
  hiddenText,
  onHiddenChange,
  banner,
}: {
  hiddenText: string
  onHiddenChange: (hiddenText: string) => Promise<void>
  banner: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      {banner}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{t('studio.videos.title')}</CardTitle>
            <CardDescription>{t('studio.videos.description')}</CardDescription>
          </div>
          <Button asChild>
            <a href={hashFor('upload')}>
              <Upload className="mr-2 h-4 w-4" />
              {t('studio.nav.pages.upload')}
            </a>
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScheduledVideos />
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <HiddenVideosPicker hiddenText={hiddenText} onChange={onHiddenChange} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
