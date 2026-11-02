import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { VideoEvent } from '@nostube/core/video-event'
import { Button } from '@nostube/widgets/components/button'
import { applyTheme } from '@nostube/widgets/site-theme'
import type { BrandingProps } from './BrandingCard'
import type { Draft } from './draft'
import { findVideo, safeThumbnail } from './HomepageCard'

/** A `#rrggbb` accent, the one form the site theme takes. */
export const ACCENT = /^#[0-9a-fA-F]{6}$/

/** The start page as the draft would show it: banner, logo, title, homepage, accent and font. */
export function SitePreview({
  draft,
  branding,
  videos,
}: {
  draft: Draft
  branding: BrandingProps['branding']
  /** The creator's loaded videos, for the titles and thumbnails of the homepage choices. */
  videos: VideoEvent[]
}) {
  const { t } = useTranslation()
  const preview = useRef<HTMLDivElement>(null)
  const home = draft.homepage
  const featured = home?.featured ? findVideo(videos, home.featured) : undefined
  const featuredThumbnail = safeThumbnail(featured)

  useEffect(() => {
    if (!preview.current || !ACCENT.test(draft.accent)) return
    applyTheme({ theme: { accent: draft.accent, font: draft.font } }, preview.current)
  }, [draft.accent, draft.font])

  return (
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
              <img src={branding.logo} alt="" className="h-12 w-auto max-w-[40%] object-contain" />
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
  )
}
