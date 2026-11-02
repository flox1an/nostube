import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VideoEvent } from '@nostube/core/video-event'
import type { PageProps } from './AppearancePage'
import type { BrandingProps } from './BrandingCard'
import { HomepageCard } from './HomepageCard'
import { PageHeader } from './PageHeader'
import { SitePreview } from './SitePreview'

/** What visitors see first: intro, featured video, selection, links and the main button. */
export function HomepagePage({
  draft,
  update,
  branding,
}: PageProps & Pick<BrandingProps, 'branding'>) {
  const { t } = useTranslation()
  // The creator's videos the homepage card loaded: titles and thumbnails for the preview.
  const [videos, setVideos] = useState<VideoEvent[]>([])
  return (
    <div className="space-y-8">
      <PageHeader
        title={t('studio.nav.pages.homepage')}
        description={t('studio.homepage.description')}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <HomepageCard
            homepage={draft.homepage}
            hiddenText={draft.hiddenText}
            onChange={homepage => update({ homepage })}
            videos={videos}
            onVideos={setVideos}
          />
        </div>
        <SitePreview draft={draft} branding={branding} videos={videos} />
      </div>
    </div>
  )
}
