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
import { Textarea } from '@nostube/widgets/components/textarea'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import type { AdminState } from './api'
import type { Draft } from './draft'
import { Field } from './fields'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { KeyList } from './KeyList'
import { MirrorCard } from './MirrorCard'
import type { PageProps } from './AppearancePage'

/** Relay and server lists most owners never touch, folded away. */
function Advanced({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        {t('studio.instance.advanced')}
      </summary>
      <div className="space-y-4 pt-3">{children}</div>
    </details>
  )
}

type ListKey =
  | 'videoSourcesText'
  | 'interactionRelaysText'
  | 'profileRelaysText'
  | 'mirrorRelaysText'
  | 'mirrorBlossomText'

/** Whose videos the site shows, where they come from, who may write, search and storage. */
export function InstancePage({ draft, update, state }: PageProps & { state: AdminState }) {
  const { t } = useTranslation()
  // The keys' profiles come through the instance client; without it the keys show bare.
  const [booted, setBooted] = useState<InstanceClient | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, () => {})
  }, [])

  /** A list edited one entry per line; `name` names its label and hint (`studio.instance.*`). */
  const list = (id: string, key: ListKey, name: string) => (
    <Field id={id} label={t(`studio.instance.${name}`)} hint={t(`studio.instance.${name}Hint`)}>
      <Textarea
        id={id}
        rows={3}
        className="font-mono text-xs"
        spellCheck={false}
        value={draft[key]}
        onChange={e => update({ [key]: e.target.value } as Partial<Draft>)}
      />
    </Field>
  )

  const keyLists = (
    <>
      <KeyList
        id="creators"
        label={t('studio.instance.creators')}
        hint={t('studio.instance.creatorsHint')}
        firstLabel={t('studio.instance.startPage')}
        text={draft.creatorsText}
        onChange={creatorsText => update({ creatorsText })}
      />
      <KeyList
        id="writers"
        label={t('studio.instance.writers')}
        hint={t('studio.instance.writersHint')}
        text={draft.writersText}
        onChange={writersText => update({ writersText })}
      />
    </>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.creatorsTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.creatorsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {booted ? (
            <InstanceProviders client={booted.client} config={booted.config}>
              {keyLists}
            </InstanceProviders>
          ) : (
            keyLists
          )}
          <Advanced>
            {list('video-sources', 'videoSourcesText', 'videoSources')}
            {list('interaction-relays', 'interactionRelaysText', 'interactionRelays')}
          </Advanced>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.profileRelaysTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.profileRelaysDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Advanced>{list('profile-relays', 'profileRelaysText', 'profileRelays')}</Advanced>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.mirrorTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.mirrorDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Advanced>
            {list('mirror-relays', 'mirrorRelaysText', 'mirrorRelays')}
            {list('mirror-blossom', 'mirrorBlossomText', 'mirrorBlossom')}
          </Advanced>
        </CardContent>
      </Card>

      {(state.config.mirror.relays.length > 0 || state.config.mirror.blossom.length > 0) && (
        <MirrorCard />
      )}

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
              <option value="external">{t('studio.instance.searchModes.external')}</option>
            </select>
          </Field>
          {draft.searchMode === 'external' && (
            <Field
              id="search-url"
              label={t('studio.instance.searchUrl')}
              hint={t('studio.instance.searchUrlHint')}
            >
              <Input
                id="search-url"
                value={draft.searchUrl}
                placeholder="https://"
                onChange={e => update({ searchUrl: e.target.value })}
              />
            </Field>
          )}
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
