import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VideoEvent } from '@nostube/core/video-event'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import type { PageProps } from './AppearancePage'
import type { BrandingProps } from './BrandingCard'
import { HomepageCard } from './HomepageCard'
import { PageHeader } from './PageHeader'
import { SitePreview } from './SitePreview'
import { bootInstanceClient, type InstanceClient } from './instance-client'

export function HomepagePage({
  draft,
  update,
  branding,
}: PageProps & Pick<BrandingProps, 'branding'>) {
  const { t } = useTranslation()
  const [videos, setVideos] = useState<VideoEvent[]>([])
  const [pins, setPins] = useState<string[]>([])
  const [instance, setInstance] = useState<InstanceClient>()
  const [error, setError] = useState('')
  useEffect(() => {
    bootInstanceClient().then(setInstance, e => setError(String(e)))
  }, [])
  return (
    <div className="space-y-8">
      <PageHeader
        title={t('studio.nav.pages.homepage')}
        description={t('studio.homepage.description')}
      />
      {error && <p role="alert">{error}</p>}
      {instance && (
        <InstanceProviders client={instance.client} config={instance.config}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <HomepageCard
              instance={instance}
              homepage={draft.homepage}
              hiddenText={draft.hiddenText}
              onChange={homepage => update({ homepage })}
              videos={videos}
              onVideos={setVideos}
              onPins={setPins}
            />
            <SitePreview draft={draft} branding={branding} videos={videos} pins={pins} />
          </div>
        </InstanceProviders>
      )}
    </div>
  )
}
