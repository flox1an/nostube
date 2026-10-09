import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SITE_FONTS } from '@nostube/core/instance-config'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { THEME_BACKGROUNDS, applyTheme, contrastRatio } from '@nostube/widgets/site-theme'
import { BrandingCard, type BrandingProps } from './BrandingCard'
import { LINK_PRESETS, linkPresetOf, type Draft } from './draft'
import { Field } from './fields'

const ACCENT = /^#[0-9a-fA-F]{6}$/

/** Where the accent is hard to see: the page background it sits on, in light or dark mode. */
function lowContrastModes(accent: string): string[] {
  if (!ACCENT.test(accent)) return []
  return (['light', 'dark'] as const).filter(
    mode => contrastRatio(accent, THEME_BACKGROUNDS[mode]) < 3
  )
}

export interface PageProps {
  draft: Draft
  update: (patch: Partial<Draft>) => void
}

/** Title, tagline, logo, favicon, banner, accent colour, font and where links to other Nostr content go. */
export function AppearancePage({ draft, update, branding, onBranding }: PageProps & BrandingProps) {
  const { t } = useTranslation()
  const preview = useRef<HTMLDivElement>(null)
  const lowContrast = lowContrastModes(draft.accent)

  useEffect(() => {
    if (!preview.current || !ACCENT.test(draft.accent)) return
    applyTheme({ theme: { accent: draft.accent, font: draft.font } }, preview.current)
  }, [draft.accent, draft.font])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('studio.appearance.siteTitle')}</CardTitle>
            <CardDescription>{t('studio.appearance.siteDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="title" label={t('studio.appearance.title')}>
              <Input
                id="title"
                value={draft.title}
                onChange={e => update({ title: e.target.value })}
              />
            </Field>
            <Field
              id="tagline"
              label={t('studio.appearance.tagline')}
              hint={t('studio.appearance.optional')}
            >
              <Input
                id="tagline"
                value={draft.tagline}
                onChange={e => update({ tagline: e.target.value })}
              />
            </Field>
          </CardContent>
        </Card>

        <BrandingCard branding={branding} onBranding={onBranding} />

        <Card>
          <CardHeader>
            <CardTitle>{t('studio.appearance.lookTitle')}</CardTitle>
            <CardDescription>{t('studio.appearance.lookDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              id="accent"
              label={t('studio.appearance.accent')}
              hint={
                lowContrast.length > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    {t(
                      `studio.appearance.lowContrast.${lowContrast.length > 1 ? 'both' : lowContrast[0]}`
                    )}
                  </span>
                ) : (
                  t('studio.appearance.accentHint')
                )
              }
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={t('studio.appearance.accentPick')}
                  value={ACCENT.test(draft.accent) ? draft.accent : '#000000'}
                  onChange={e => update({ accent: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                />
                <Input
                  id="accent"
                  value={draft.accent}
                  onChange={e => update({ accent: e.target.value })}
                  className="w-32 font-mono"
                  spellCheck={false}
                />
              </div>
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t('studio.appearance.font')}</legend>
              <div className="flex flex-wrap gap-2">
                {SITE_FONTS.map(font => (
                  <label
                    key={font}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-ring ${
                      font === 'serif' ? 'font-serif' : font === 'mono' ? 'font-mono' : 'font-sans'
                    }`}
                  >
                    <input
                      type="radio"
                      name="font"
                      value={font}
                      checked={draft.font === font}
                      onChange={() => update({ font })}
                      className="sr-only"
                    />
                    {t(`studio.appearance.fonts.${font}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

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

      <aside>
        <p className="mb-2 text-sm font-medium">{t('studio.appearance.preview')}</p>
        <div
          ref={preview}
          className="space-y-3 rounded-lg border border-border bg-background p-4 text-foreground"
        >
          <div>
            <p className="text-2xl font-semibold">
              {draft.title || t('studio.appearance.previewTitle')}
            </p>
            {draft.tagline && <p className="text-sm text-muted-foreground">{draft.tagline}</p>}
          </div>
          <div className="aspect-video rounded-md bg-muted" />
          <p className="text-sm font-medium">{t('studio.appearance.previewVideo')}</p>
          <Button type="button" size="sm">
            {t('studio.appearance.previewButton')}
          </Button>
        </div>
      </aside>
    </div>
  )
}
