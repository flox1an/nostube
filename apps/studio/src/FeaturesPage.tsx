import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import type { PageProps } from './AppearancePage'
import { LINK_PRESETS, isLightningAddress, linkPresetOf } from './draft'
import { FeatureCard, Field } from './fields'
import { PageHeader } from './PageHeader'
import { useSigner } from './signer-context'

/** What the site offers beyond the videos, each behind its own switch, and where links lead. */
export function FeaturesPage({ draft, update }: PageProps) {
  const { t } = useTranslation()
  const { mode } = useSigner()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.features')}
        description={t('studio.page.features.description')}
      />
      <FeatureCard
        title={t('studio.features.searchTitle')}
        description={t('studio.features.searchDescription')}
        checked={draft.searchMode === 'local'}
        onCheckedChange={on => update({ searchMode: on ? 'local' : 'off' })}
      />
      <FeatureCard
        title={t('studio.pages.plays.title')}
        description={t('studio.pages.plays.description')}
        checked={draft.countPlays}
        onCheckedChange={countPlays => update({ countPlays })}
      >
        <p className="text-sm text-muted-foreground">{t('studio.pages.plays.hint')}</p>
        <p className="text-sm">{t('studio.pages.plays.privacy')}</p>
      </FeatureCard>
      {mode === 'managed' ? (
        <ZapsCard lightning={draft.lightning} onChange={lightning => update({ lightning })} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('studio.features.zapsTitle')}</CardTitle>
            <CardDescription>{t('studio.features.zapsOwn')}</CardDescription>
          </CardHeader>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.appearance.linksTitle')}</CardTitle>
          <CardDescription>{t('studio.appearance.linksDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="link-preset" label={t('studio.appearance.openOn')}>
            <select
              id="link-preset"
              value={linkPresetOf(draft.links)}
              onChange={e => {
                const preset = LINK_PRESETS.find(p => p.id === e.target.value)
                if (preset) update({ links: { ...preset.links } })
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {LINK_PRESETS.map(p => (
                <option key={p.id} value={p.id}>
                  {t(`studio.appearance.presets.${p.id}`)}
                </option>
              ))}
              {linkPresetOf(draft.links) === 'custom' && (
                <option value="custom">{t('studio.appearance.presets.custom')}</option>
              )}
            </select>
          </Field>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {t('studio.appearance.editAddresses')}
            </summary>
            <div className="space-y-3 pt-3">
              {(['profile', 'video', 'note'] as const).map(key => (
                <Field
                  key={key}
                  id={`link-${key}`}
                  label={t(`studio.appearance.linkKinds.${key}`)}
                  hint={key === 'profile' ? t('studio.appearance.profileHint') : undefined}
                >
                  <Input
                    id={`link-${key}`}
                    value={draft.links[key]}
                    className="font-mono text-xs"
                    spellCheck={false}
                    onChange={e => update({ links: { ...draft.links, [key]: e.target.value } })}
                  />
                </Field>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}

/** Zaps go to the Lightning address in the channel profile: on means an address is set. */
function ZapsCard({
  lightning,
  onChange,
}: {
  lightning: string
  onChange: (lightning: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // Switching off clears the address; switching on again before saving brings it back.
  const stash = useRef(lightning)
  return (
    <FeatureCard
      title={t('studio.features.zapsTitle')}
      description={t('studio.features.zapsDescription')}
      checked={open || lightning !== ''}
      onCheckedChange={on => {
        setOpen(on)
        if (on) onChange(stash.current)
        else {
          stash.current = lightning
          onChange('')
        }
      }}
    >
      <Field
        id="lightning"
        label={t('studio.appearance.lightning')}
        hint={
          isLightningAddress(lightning.trim()) ? (
            t('studio.appearance.lightningHint')
          ) : (
            <span className="text-destructive">{t('studio.appearance.lightningInvalid')}</span>
          )
        }
      >
        <Input
          id="lightning"
          inputMode="email"
          autoComplete="off"
          placeholder="name@getalby.com"
          value={lightning}
          onChange={e => onChange(e.target.value)}
        />
      </Field>
    </FeatureCard>
  )
}
