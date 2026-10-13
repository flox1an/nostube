import { useEffect, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import type { AdminState } from './api'
import { Field } from './fields'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { KeyList } from './KeyList'
import { ReachChoice } from './ReachChoice'
import { useSigner } from './signer-context'
import type { PageProps } from './AppearancePage'

/** Key lists show the keys' profiles through the instance client; without it the keys show bare. */
export function WithKeyProfiles({ children }: { children: ReactNode }) {
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

/** The settings every owner meets: reach, whose videos the site shows, search and storage. */
export function InstancePage({ draft, update, state }: PageProps & { state: AdminState }) {
  const { t } = useTranslation()
  const { mode } = useSigner()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.reach.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReachChoice
            reach={draft.reach}
            onChange={reach => update({ reach })}
            canBePublic={state.canBePublic}
            own={mode === 'own'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.creatorsTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.creatorsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <WithKeyProfiles>
            <KeyList
              id="creators"
              label={t('studio.instance.creators')}
              hint={t('studio.instance.creatorsHint')}
              firstLabel={t('studio.instance.startPage')}
              text={draft.creatorsText}
              onChange={creatorsText => update({ creatorsText })}
            />
          </WithKeyProfiles>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.search')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="search-mode"
            label={t('studio.instance.search')}
            hint={t('studio.instance.searchHint')}
          >
            <select
              id="search-mode"
              value={draft.searchMode}
              onChange={e => update({ searchMode: e.target.value as typeof draft.searchMode })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="off">{t('studio.instance.searchModes.off')}</option>
              <option value="local">{t('studio.instance.searchModes.local')}</option>
            </select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.storage')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="quota"
            label={t('studio.instance.quota')}
            hint={t('studio.instance.quotaHint')}
          >
            <Input
              id="quota"
              type="number"
              min={0}
              value={draft.quota}
              onChange={e => update({ quota: e.target.value })}
            />
          </Field>
          <Field id="reserve" label={t('studio.instance.reserve')}>
            <Input
              id="reserve"
              type="number"
              min={0}
              value={draft.reserve}
              onChange={e => update({ reserve: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Trans
          i18nKey="studio.instance.fixed"
          values={{ origin: state.origin, tls: state.tls }}
          components={{ code: <code /> }}
        />
      </p>
    </div>
  )
}
