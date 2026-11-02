import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Textarea } from '@nostube/widgets/components/textarea'
import type { PageProps } from './AppearancePage'
import type { Draft } from './draft'
import { Field } from './fields'
import { PageHeader } from './PageHeader'

type ListKey =
  'videoSourcesText' | 'interactionRelaysText' | 'profileRelaysText' | 'signerRelaysText'

/**
 * Where the site reads from, and the relays sign-in uses. In Private the server answers with its
 * own relay whatever the read lists hold, so they show only in Public (and keep their values).
 */
export function RelaysPage({ draft, update }: PageProps) {
  const { t } = useTranslation()

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.relays')}
        description={t('studio.page.relays.description')}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.instance.relaysTitle')}</CardTitle>
          <CardDescription>
            {t(
              draft.reach === 'private'
                ? 'studio.relays.privateNote'
                : 'studio.instance.relaysDescription'
            )}
          </CardDescription>
        </CardHeader>
        {draft.reach === 'public' && (
          <CardContent className="space-y-4">
            {list('video-sources', 'videoSourcesText', 'videoSources')}
            {list('interaction-relays', 'interactionRelaysText', 'interactionRelays')}
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.relays.signInTitle')}</CardTitle>
          <CardDescription>{t('studio.relays.signInDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <details className="space-y-4 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {t('studio.relays.signInEdit')}
            </summary>
            <div className="space-y-6 pt-3">
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {t('studio.instance.profileRelaysDescription')}
                </p>
                {list('profile-relays', 'profileRelaysText', 'profileRelays')}
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  {t('studio.instance.signerRelaysDescription')}
                </p>
                {list('signer-relays', 'signerRelaysText', 'signerRelays')}
              </div>
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
