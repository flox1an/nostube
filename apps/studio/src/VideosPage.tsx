import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { hashFor } from './route'
import { PageHeader } from './PageHeader'
import { ScheduledVideos } from './ScheduledVideos'

const HiddenVideosPicker = lazy(() => import('./HiddenVideosPicker'))

/** The creator's videos; hiding one applies to the public site at once, so there is no save bar. */
export function VideosPage({
  hiddenText,
  onHiddenChange,
  countPlays,
}: {
  hiddenText: string
  onHiddenChange: (hiddenText: string) => Promise<void>
  /** The saved config counts plays. */
  countPlays: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.videos')}
        description={t('studio.videos.description')}
        actions={
          <Button asChild>
            <a href={hashFor('upload')}>
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              {t('studio.nav.pages.upload')}
            </a>
          </Button>
        }
      />
      <ScheduledVideos />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <HiddenVideosPicker
          hiddenText={hiddenText}
          onChange={onHiddenChange}
          countPlays={countPlays}
        />
      </Suspense>
    </div>
  )
}
