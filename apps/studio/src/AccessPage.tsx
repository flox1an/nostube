import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import type { PageProps } from './AppearancePage'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { KeyList } from './KeyList'
import { PageHeader } from './PageHeader'

/** Key lists show the keys' profiles through the instance client; without it the keys show bare. */
function WithKeyProfiles({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState<InstanceClient | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, () => {})
  }, [])
  return booted ? (
    <InstanceProviders client={booted.client} config={booted.config}>
      {children}
    </InstanceProviders>
  ) : (
    <>{children}</>
  )
}

/** Whose videos the site shows, and which keys may publish and upload to this server. */
export function AccessPage({ draft, update }: PageProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.access')}
        description={t('studio.page.access.description')}
      />
      <WithKeyProfiles>
        <Card>
          <CardHeader>
            <CardTitle>{t('studio.instance.creatorsTitle')}</CardTitle>
            <CardDescription>{t('studio.instance.creatorsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <KeyList
              id="creators"
              label={t('studio.instance.creators')}
              hint={t('studio.instance.creatorsHint')}
              firstLabel={t('studio.instance.startPage')}
              text={draft.creatorsText}
              onChange={creatorsText => update({ creatorsText })}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('studio.instance.writers')}</CardTitle>
            <CardDescription>{t('studio.access.writersDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <KeyList
              id="writers"
              label={t('studio.instance.writers')}
              hint={t('studio.instance.writersHint')}
              text={draft.writersText}
              onChange={writersText => update({ writersText })}
            />
          </CardContent>
        </Card>
      </WithKeyProfiles>
    </div>
  )
}
