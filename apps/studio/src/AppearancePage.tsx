import { useTranslation } from 'react-i18next'
import { SITE_FONTS } from '@nostube/core/instance-config'
import { PageHeader } from './PageHeader'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { THEME_BACKGROUNDS, contrastRatio } from '@nostube/widgets/site-theme'
import { BrandingCard, type BrandingProps } from './BrandingCard'
import type { Draft } from './draft'
import { Field } from './fields'
import { ACCENT, SitePreview } from './SitePreview'

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

/** Title, tagline, logo, favicon, banner, app icon, accent colour and font. */
export function AppearancePage({ draft, update, branding, onBranding }: PageProps & BrandingProps) {
  const { t } = useTranslation()
  const lowContrast = lowContrastModes(draft.accent)

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('studio.nav.pages.appearance')}
        description={t('studio.page.appearance.description')}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
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
                        font === 'serif'
                          ? 'font-serif'
                          : font === 'mono'
                            ? 'font-mono'
                            : 'font-sans'
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
        </div>

        <SitePreview draft={draft} branding={branding} videos={[]} />
      </div>
    </div>
  )
}
