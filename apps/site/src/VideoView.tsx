import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { buildShareLinks } from '@nostube/core/share-links'
import { getPublishDate, type VideoEvent } from '@nostube/core/video-event'
import { parseVideoChapters } from '@nostube/core/video-chapters'
import { formatDate } from '@nostube/widgets'
import { cn } from '@nostube/widgets/cn'
import { Button } from '@nostube/widgets/components/button'
import { RichTextContent, type RichTextLinks } from '@nostube/widgets/components/RichTextContent'
import ShareButton from '@nostube/widgets/components/ShareButton'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { VideoPlayer } from '@nostube/widgets/player'
import { AgeConfirm } from './AgeConfirm'
import { Comments } from './Comments'
import { VideoLinks } from './GridPage'
import type { AgeGate } from './use-age-gate'
import { playerBoxStyle } from './player-box'
import { siteLinks } from './site-links'
import { SiteLikes } from './SiteLikes'
import { SiteReport } from './SiteReport'
import { SiteZap } from './SiteZap'
import { useCreatorVideos } from './use-creator-videos'
import { useEscapeToHome } from './use-escape-to-home'
import { useSeekEvents } from './use-seek-events'
import type { VideoLookup } from './use-video-by-id'
import { tagPath, videoPath } from './video-path'
import { videoRef } from '@nostube/core/hidden-videos'
import { startPosition } from '@nostube/core/watch-progress'
import { chooseNextVideo } from './next-up'
import { forgetProgress, savedProgress, saveProgress } from './use-watch-progress'
import { ChapterList, Transcript } from './VideoPanels'

/**
 * One video at its own URL (`/v/<naddr>`), so it can be shared and opened directly. The site
 * header resolves the video (its breadcrumb names it) and hands the lookup down.
 */
export function VideoView({
  config,
  gate,
  authorName,
  lookup,
}: {
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
  lookup: VideoLookup
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const video = lookup.status === 'found' ? lookup.video : null
  useEscapeToHome()

  useEffect(() => {
    if (video) document.title = `${video.title} – ${config.title}`
    return () => {
      document.title = config.title
    }
  }, [video, config.title])

  if (lookup.status === 'invalid' || lookup.status === 'not-found') {
    return (
      <p className="py-12 text-center text-muted-foreground">
        {t(lookup.status === 'invalid' ? 'site.video.invalidLink' : 'site.video.notFound')}
      </p>
    )
  }
  if (!video) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t('site.video.loading')}>
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {gate.isLocked(video) ? (
        <AgeConfirm onConfirm={gate.confirm} onCancel={() => navigate('/')} />
      ) : (
        <VideoDetails
          key={video.id}
          video={video}
          config={config}
          gate={gate}
          authorName={authorName}
        />
      )}
      {!gate.isLocked(video) && <MoreVideos config={config} gate={gate} current={video} />}
    </div>
  )
}

/** The creator's other videos below the current one, so a video page is no dead end. */
function MoreVideos({
  config,
  gate,
  current,
}: {
  config: InstanceConfig
  gate: AgeGate
  current: VideoEvent
}) {
  const { t } = useTranslation()
  const { videos } = useCreatorVideos(config)
  const others = useMemo(
    () => videos.filter(v => v.id !== current.id).slice(0, 8),
    [videos, current.id]
  )
  if (others.length === 0) return null
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-lg font-semibold">{t('site.video.moreVideos')}</h3>
      <VideoLinks videos={others} gate={gate} />
    </section>
  )
}

function VideoDetails({
  video,
  config,
  gate,
  authorName,
}: {
  video: VideoEvent
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
}) {
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const reference = videoRef(video)
  // An explicit link time (`?t=`, even 0) always wins over the position saved on this device.
  const [startAt] = useState(() => {
    const raw = searchParams.get('t')
    const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
    return startPosition(Number.isFinite(parsed) ? parsed : null, savedProgress(reference))
  })
  const [shareOpen, setShareOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(false)
  const [shareTime, setShareTime] = useState(startAt)
  const [currentTime, setCurrentTime] = useState(startAt)
  const [mediaElement, setMediaElement] = useState<HTMLMediaElement | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)
  const lastTime = useRef(startAt)
  const updateTime = useCallback(
    (time: number) => {
      setCurrentTime(Math.floor(time))
      lastTime.current = time
      const known = mediaElement?.duration
      saveProgress(reference, time, known && Number.isFinite(known) ? known : video.duration)
    },
    [mediaElement, reference, video.duration]
  )
  const handleEnded = useCallback(() => {
    forgetProgress(reference)
    setEnded(true)
  }, [reference])
  useEffect(() => {
    if (!mediaElement) return
    const playing = () => setEnded(false)
    // A jump (chapter, transcript line, timestamp link, scrubbing) shows at once, not on the
    // player's next once-a-second time update.
    const seeked = () => setCurrentTime(Math.floor(mediaElement.currentTime))
    mediaElement.addEventListener('play', playing)
    mediaElement.addEventListener('seeked', seeked)
    return () => {
      mediaElement.removeEventListener('play', playing)
      mediaElement.removeEventListener('seeked', seeked)
    }
  }, [mediaElement])
  useSeekEvents(mediaElement)
  const links = useMemo(() => siteLinks(config), [config])
  // The canonical origin (not whatever host the viewer used) makes the link and the embed stable.
  const canonicalUrl = `${config.origin}${videoPath(video)}`
  const shareUrl = includeTimestamp ? `${canonicalUrl}?t=${shareTime}` : canonicalUrl
  const onShareOpenChange = (open: boolean) => {
    if (open) setShareTime(Math.max(0, Math.floor(mediaElement?.currentTime ?? currentTime)))
    setShareOpen(open)
  }
  const chapters = useMemo(
    () => parseVideoChapters(video.description, video.duration),
    [video.description, video.duration]
  )
  const shareLinks = useMemo(
    () => buildShareLinks(shareUrl, shareUrl, video.title, video.images[0] ?? ''),
    [shareUrl, video.title, video.images]
  )

  return (
    <article className="space-y-3">
      {/* Edge to edge on a phone: cancel the page's side padding. */}
      <div className="-mx-4 sm:mx-0">
        <div
          className="mx-auto overflow-hidden sm:rounded-lg"
          style={playerBoxStyle(video.dimensions)}
        >
          <VideoPlayer
            key={`${video.id}:${attempt}`}
            urls={video.urls}
            textTracks={video.textTracks}
            mime={video.mimeType ?? ''}
            mediaType={video.mediaType}
            poster={video.images[0] ?? ''}
            posterHash={video.thumbnailVariants[0]?.hash}
            sha256={video.x}
            authorPubkey={video.pubkey}
            eventId={video.id}
            videoVariants={video.videoVariants}
            contentWarning={gate.warningFor(video)}
            title={video.title}
            authorName={authorName}
            className="h-full w-full"
            initialPlayPos={attempt > 0 ? Math.floor(lastTime.current) : startAt}
            onVideoElementReady={setMediaElement}
            onTimeUpdate={updateTime}
            chapters={chapters}
            onEnded={handleEnded}
            onAllSourcesFailed={() => setFailed(true)}
          />
        </div>
      </div>
      {failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/50 p-3 text-sm"
        >
          <p>{t('site.watch.playbackFailed')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFailed(false)
              setAttempt(value => value + 1)
            }}
          >
            {t('site.watch.retry')}
          </Button>
        </div>
      )}
      {ended && !failed && (
        <UpNext
          config={config}
          gate={gate}
          current={video}
          onReplay={() => {
            if (!mediaElement) return
            mediaElement.currentTime = 0
            void Promise.resolve(mediaElement.play()).catch(() => {})
          }}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-xl font-semibold">{video.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(getPublishDate(video), i18n.resolvedLanguage)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SiteLikes video={video} relays={config.interactionRelays} />
          <SiteZap video={video} relays={config.interactionRelays} currentTime={currentTime} />
          <SiteReport
            target={{ type: 'video', id: video.id, author: video.pubkey }}
            relays={config.interactionRelays}
          />
          <ShareButton
            shareOpen={shareOpen}
            setShareOpen={onShareOpenChange}
            shareUrl={shareUrl}
            shareTitle={video.title}
            shareLinks={shareLinks}
            includeTimestamp={includeTimestamp}
            setIncludeTimestamp={setIncludeTimestamp}
            label={t('site.video.share')}
          />
        </div>
      </div>
      {/* Keyed by video, so another video starts collapsed again. */}
      {video.description && <Description key={video.id} video={video} links={links} />}
      {video.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('site.video.tags')}>
          {video.tags.map(tag => (
            <li key={tag}>
              <Link
                to={tagPath(tag)}
                className="block rounded-full bg-secondary px-2.5 py-0.5 text-xs hover:underline"
              >
                #{tag}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ChapterList
        chapters={chapters}
        currentTime={currentTime}
        element={mediaElement}
        onJump={setCurrentTime}
      />
      <Transcript
        tracks={video.textTracks}
        currentTime={currentTime}
        element={mediaElement}
        onJump={setCurrentTime}
      />
      <Comments
        target={{
          videoId: video.id,
          authorPubkey: video.pubkey,
          videoKind: video.kind,
          identifier: video.identifier,
        }}
        links={links}
        relays={config.interactionRelays}
        creators={config.creators}
      />
    </article>
  )
}

/** The description: a few lines until the viewer asks for the rest. */
function Description({ video, links }: { video: VideoEvent; links: RichTextLinks }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  // Offer More only when the clamp hides something; re-check as the width or inline images change.
  useLayoutEffect(() => {
    const text = ref.current?.firstElementChild
    if (!text || expanded) return
    const check = () => setOverflows(text.scrollHeight > text.clientHeight)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(text)
    return () => observer.disconnect()
  }, [expanded, video.description])

  return (
    <div>
      <div id={id} ref={ref}>
        <RichTextContent
          content={video.description}
          videoLink={video.link}
          authorPubkey={video.pubkey}
          links={links}
          className={cn(
            'break-words text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline-offset-2 [&_a:hover]:underline',
            !expanded && 'line-clamp-3'
          )}
        />
      </div>
      {overflows && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 px-2"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(open => !open)}
        >
          {expanded ? t('site.video.less') : t('site.video.more')}
        </Button>
      )}
    </div>
  )
}

/** After the video: the next one in the creator's order, or watching it again. */
function UpNext({
  config,
  gate,
  current,
  onReplay,
}: {
  config: InstanceConfig
  gate: AgeGate
  current: VideoEvent
  onReplay: () => void
}) {
  const { t } = useTranslation()
  const { videos } = useCreatorVideos(config)
  const next = useMemo(
    () => chooseNextVideo(videos, current, config.site.homepage?.selected ?? []),
    [videos, current, config.site.homepage?.selected]
  )
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="up-next">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="up-next" className="text-lg font-semibold">
          {t('site.watch.upNext')}
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onReplay}>
          {t('site.watch.replay')}
        </Button>
      </div>
      {next && (
        <div className="max-w-xs">
          <VideoLinks videos={[next]} gate={gate} />
        </div>
      )}
    </section>
  )
}
