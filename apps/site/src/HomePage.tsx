import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Play } from 'lucide-react'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { Button } from '@nostube/widgets/components/button'
import { GridPage, VideoLinks } from './GridPage'
import type { AgeGate } from './use-age-gate'
import { useVideosByRef } from './use-videos-by-ref'
import { useWatchProgressList } from './use-watch-progress'
import { videoPath } from './video-path'

/** Videos shown in the "continue watching" row: a short row, not a history. */
const CONTINUE_LIMIT = 4

export function HomePage({ config, gate }: { config: InstanceConfig; gate: AgeGate }) {
  const { t } = useTranslation()
  const home = config.site.homepage
  const { list: progress, clear } = useWatchProgressList()
  const found = useVideosByRef(config, [
    home?.featured ?? '',
    ...(home?.selected ?? []),
    ...progress.map(entry => entry.ref),
  ])
  const continuing = useMemo(() => {
    const seen = new Set<string>()
    return progress.flatMap(entry => {
      const video = found.get(entry.ref)
      if (!video || seen.has(video.id)) return []
      seen.add(video.id)
      return [video]
    })
  }, [found, progress]).slice(0, CONTINUE_LIMIT)
  const featured = home?.featured ? found.get(home.featured) : undefined
  const selected = useMemo(() => {
    const seen = new Set<string>()
    return (home?.selected ?? []).flatMap(ref => {
      const video = found.get(ref)
      if (!video || seen.has(video.id)) return []
      seen.add(video.id)
      return [video]
    })
  }, [found, home?.selected])
  const curated = !!(
    home?.intro ||
    home?.action ||
    home?.links.length ||
    featured ||
    selected.length
  )

  return (
    <main className="space-y-8 sm:space-y-10">
      {(home?.intro || home?.action || !!home?.links.length) && (
        <section className="space-y-4" aria-label={t('site.home.about')}>
          {home.intro && (
            <p className="max-w-3xl whitespace-pre-line break-words text-base leading-relaxed text-muted-foreground sm:text-lg">
              {home.intro}
            </p>
          )}
          {(home.action || home.links.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {home.action && (
                <Button asChild className="h-auto min-h-10 max-w-full whitespace-normal py-2">
                  <a href={home.action.url} rel="noopener noreferrer">
                    <span className="min-w-0 break-words">{home.action.label}</span>
                    <ArrowUpRight aria-hidden className="ml-1 h-4 w-4 shrink-0" />
                  </a>
                </Button>
              )}
              {home.links.map(link => (
                <a
                  key={`${link.label}:${link.url}`}
                  href={link.url}
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 max-w-full items-center gap-1 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <span className="min-w-0 break-words">{link.label}</span>
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}
      {continuing.length > 0 && (
        <section className="space-y-4" aria-labelledby="continue-watching">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="continue-watching" className="text-xl font-semibold sm:text-2xl">
              {t('site.home.continue')}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              aria-label={t('site.home.clearProgressLabel')}
            >
              {t('site.home.clearProgress')}
            </Button>
          </div>
          <VideoLinks videos={continuing} gate={gate} />
        </section>
      )}
      {featured && (
        <FeaturedVideo
          key={featured.id}
          video={featured}
          note={home?.featuredText ?? ''}
          locked={gate.isLocked(featured)}
        />
      )}
      {selected.length > 0 && (
        <section className="space-y-4" aria-labelledby="selected-videos">
          <h2 id="selected-videos" className="text-xl font-semibold sm:text-2xl">
            {t('site.home.selected')}
          </h2>
          <VideoLinks videos={selected} gate={gate} />
        </section>
      )}
      <section className="space-y-4" aria-label={curated ? t('site.home.latest') : undefined}>
        {curated && <h2 className="text-xl font-semibold sm:text-2xl">{t('site.home.latest')}</h2>}
        <GridPage config={config} gate={gate} />
      </section>
    </main>
  )
}

function FeaturedVideo({
  video,
  note,
  locked,
}: {
  video: VideoEvent
  note: string
  locked: boolean
}) {
  const { t } = useTranslation()
  const [imageFailed, setImageFailed] = useState(false)
  const thumbnail = video.thumbnailVariants[0]?.url ?? video.images[0]
  const href = videoPath(video)
  return (
    <section
      aria-labelledby="featured-video"
      className="overflow-hidden rounded-xl border bg-card text-card-foreground sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <Link
        to={href}
        aria-label={video.title}
        className="group relative flex aspect-video items-center justify-center overflow-hidden bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:aspect-auto sm:min-h-64"
      >
        {!locked && thumbnail && !imageFailed ? (
          <img
            src={thumbnail}
            alt=""
            fetchPriority="high"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        ) : locked ? (
          <span className="px-4 text-center text-sm text-muted-foreground">
            {t('video.grid.contentWarning')}
          </span>
        ) : (
          <Play aria-hidden className="h-12 w-12 text-muted-foreground" />
        )}
      </Link>
      <div className="flex flex-col items-start justify-center gap-4 p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('site.home.featured')}
        </p>
        <h2
          id="featured-video"
          className="break-words text-2xl font-semibold leading-tight sm:text-3xl"
        >
          {video.title}
        </h2>
        {!locked && note && (
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
            {note}
          </p>
        )}
        <Button asChild>
          <Link to={href}>
            <Play aria-hidden className="mr-2 h-4 w-4" />
            {t('site.home.watch')}
          </Link>
        </Button>
      </div>
    </section>
  )
}
