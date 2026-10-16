import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SITE_FONTS } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
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
import { LINK_PRESETS, isLightningAddress, linkPresetOf, type Draft } from './draft'
import { Field } from './fields'
import { HomepageCard, findVideo, safeThumbnail } from './HomepageCard'

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

/** Title, tagline, homepage curation, logo, favicon, banner, accent colour, font and where links to other Nostr content go. */
export function AppearancePage({ draft, update, branding, onBranding }: PageProps & BrandingProps) {
  const { t } = useTranslation()
  const preview = useRef<HTMLDivElement>(null)
  const lowContrast = lowContrastModes(draft.accent)
  // The creator's videos the homepage card loaded: titles and thumbnails for the preview.
  const [videos, setVideos] = useState<VideoEvent[]>([])
  const home = draft.homepage
  const featured = home?.featured ? findVideo(videos, home.featured) : undefined
  const featuredThumbnail = safeThumbnail(featured)

  useEffect(() => {
    if (!preview.current || !ACCENT.test(draft.accent)) return
    applyTheme({ theme: { accent: draft.accent, font: draft.font } }, preview.current)
  }, [draft.accent, draft.font])

  return (
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
            <Field
              id="lightning"
              label={t('studio.appearance.lightning')}
              hint={
                isLightningAddress(draft.lightning.trim()) ? (
                  t('studio.appearance.lightningHint')
                ) : (
                  <span className="text-destructive">
                    {t('studio.appearance.lightningInvalid')}
                  </span>
                )
              }
            >
              <Input
                id="lightning"
                inputMode="email"
                autoComplete="off"
                placeholder="name@getalby.com"
                value={draft.lightning}
                onChange={e => update({ lightning: e.target.value })}
              />
            </Field>
          </CardContent>
        </Card>

        <HomepageCard
          homepage={draft.homepage}
          hiddenText={draft.hiddenText}
          onChange={homepage => update({ homepage })}
          videos={videos}
          onVideos={setVideos}
        />

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

      <aside className="min-w-0">
        <p className="mb-2 text-sm font-medium">{t('studio.appearance.preview')}</p>
        <div
          ref={preview}
          className="overflow-hidden rounded-lg border border-border bg-background text-foreground"
        >
          {branding.banner ? (
            <img src={branding.banner} alt="" className="aspect-[5/1] w-full object-cover" />
          ) : (
            <div className="aspect-[5/1] border-b border-border bg-muted" />
          )}
          <div className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              {branding.logo ? (
                <img
                  src={branding.logo}
                  alt=""
                  className="h-12 w-auto max-w-[40%] object-contain"
                />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">
                  {draft.title || t('studio.appearance.previewTitle')}
                </p>
                {draft.tagline && (
                  <p className="truncate text-sm text-muted-foreground">{draft.tagline}</p>
                )}
              </div>
            </div>
            {home?.intro.trim() && (
              <p className="line-clamp-4 whitespace-pre-line text-sm">{home.intro.trim()}</p>
            )}
            {home?.featured && (
              <div className="space-y-1">
                {featuredThumbnail ? (
                  <img
                    src={featuredThumbnail}
                    alt=""
                    className="aspect-video w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="aspect-video rounded-md bg-muted" />
                )}
                <p className="line-clamp-2 text-sm font-medium">
                  {featured?.title ?? t('studio.homepage.featured')}
                </p>
                {home.featuredText.trim() && (
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {home.featuredText.trim()}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {home?.selected.length
                ? home.selected.map(ref => {
                    const video = findVideo(videos, ref)
                    const thumbnail = safeThumbnail(video)
                    return (
                      <div key={ref} className="space-y-1">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt=""
                            className="aspect-video w-full rounded-md object-cover"
                          />
                        ) : (
                          <div className="aspect-video rounded-md bg-muted" />
                        )}
                        {video ? (
                          <p className="line-clamp-1 text-xs">{video.title}</p>
                        ) : (
                          <div className="h-2 w-3/4 rounded bg-muted" />
                        )}
                      </div>
                    )
                  })
                : [0, 1, 2, 3].map(n => (
                    <div key={n} className="space-y-1">
                      <div className="aspect-video rounded-md bg-muted" />
                      <div className="h-2 w-3/4 rounded bg-muted" />
                    </div>
                  ))}
            </div>
            {home && home.links.some(l => l.label.trim()) && (
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {home.links
                  .filter(l => l.label.trim())
                  .map((l, i) => (
                    <span key={i} className="text-primary underline">
                      {l.label.trim()}
                    </span>
                  ))}
              </p>
            )}
            <Button type="button" size="sm">
              {home?.action?.label.trim() || t('studio.appearance.previewButton')}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  )
}
