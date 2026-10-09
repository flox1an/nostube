import { Trans, useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { InterfaceLanguageSelect } from '@nostube/widgets/components/InterfaceLanguageSelect'
import { Textarea } from '@nostube/widgets/components/textarea'
import type { AdminState } from './api'
import { Field } from './fields'
import type { PageProps } from './AppearancePage'

const lines = 'font-mono text-xs'

/** Whose videos the site shows, where they come from, who may write, search and storage. */
export function InstancePage({ draft, update, state }: PageProps & { state: AdminState }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('common.interfaceLanguage')}</CardTitle>
          <CardDescription>{t('studio.instance.languageHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <InterfaceLanguageSelect />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.creatorsTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.creatorsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="creators"
            label={t('studio.instance.creators')}
            hint={t('studio.instance.creatorsHint')}
          >
            <Textarea
              id="creators"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.creatorsText}
              onChange={e => update({ creatorsText: e.target.value })}
            />
          </Field>
          <Field
            id="writers"
            label={t('studio.instance.writers')}
            hint={t('studio.instance.writersHint')}
          >
            <Textarea
              id="writers"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.writersText}
              onChange={e => update({ writersText: e.target.value })}
            />
          </Field>
          <Field
            id="video-sources"
            label={t('studio.instance.videoSources')}
            hint={t('studio.instance.videoSourcesHint')}
          >
            <Textarea
              id="video-sources"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.videoSourcesText}
              onChange={e => update({ videoSourcesText: e.target.value })}
            />
          </Field>
          <Field
            id="interaction-relays"
            label={t('studio.instance.interactionRelays')}
            hint={t('studio.instance.interactionRelaysHint')}
          >
            <Textarea
              id="interaction-relays"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.interactionRelaysText}
              onChange={e => update({ interactionRelaysText: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.search')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="search-mode" label={t('studio.instance.search')}>
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
