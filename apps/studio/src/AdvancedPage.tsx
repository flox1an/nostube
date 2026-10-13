import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Textarea } from '@nostube/widgets/components/textarea'
import type { AdminState } from './api'
import type { Draft } from './draft'
import { Field } from './fields'
import { WithKeyProfiles } from './InstancePage'
import { KeyList } from './KeyList'
import { MirrorCard } from './MirrorCard'
import type { PageProps } from './AppearancePage'

type ListKey =
  | 'videoSourcesText'
  | 'interactionRelaysText'
  | 'profileRelaysText'
  | 'mirrorRelaysText'
  | 'mirrorBlossomText'

/** Writers, relay and mirror lists most owners never touch. */
export function AdvancedPage({ draft, update, state }: PageProps & { state: AdminState }) {
  const { t } = useTranslation()
  // Privat: the server sends only its own relay, whatever these lists hold (they keep their values).
  const publicOnly = draft.reach === 'private'

  /** A list edited one entry per line; `name` names its label and hint (`studio.instance.*`). */
  const list = (id: string, key: ListKey, name: string, disabled = false) => (
    <Field id={id} label={t(`studio.instance.${name}`)} hint={t(`studio.instance.${name}Hint`)}>
      <Textarea
        id={id}
        rows={3}
        className="font-mono text-xs"
        spellCheck={false}
        disabled={disabled}
        value={draft[key]}
        onChange={e => update({ [key]: e.target.value } as Partial<Draft>)}
      />
    </Field>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.writers')}</CardTitle>
        </CardHeader>
        <CardContent>
          <WithKeyProfiles>
            <KeyList
              id="writers"
              label={t('studio.instance.writers')}
              hint={t('studio.instance.writersHint')}
              text={draft.writersText}
              onChange={writersText => update({ writersText })}
            />
          </WithKeyProfiles>
        </CardContent>
      </Card>

      {publicOnly && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm">
          {t('studio.advanced.privateNote')}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.relaysTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.relaysDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {list('video-sources', 'videoSourcesText', 'videoSources', publicOnly)}
          {list('interaction-relays', 'interactionRelaysText', 'interactionRelays', publicOnly)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.profileRelaysTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.profileRelaysDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {list('profile-relays', 'profileRelaysText', 'profileRelays', publicOnly)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.mirrorTitle')}</CardTitle>
          <CardDescription>{t('studio.instance.mirrorDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {list('mirror-relays', 'mirrorRelaysText', 'mirrorRelays')}
          {list('mirror-blossom', 'mirrorBlossomText', 'mirrorBlossom')}
        </CardContent>
      </Card>

      {(state.config.mirror.relays.length > 0 || state.config.mirror.blossom.length > 0) && (
        <MirrorCard />
      )}
    </div>
  )
}
