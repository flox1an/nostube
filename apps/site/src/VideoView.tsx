import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
import { Breadcrumb } from './Breadcrumb'
import { Comments } from './Comments'
import type { AgeGate } from './use-age-gate'
import { playerBoxStyle } from './player-box'
import { siteLinks } from './site-links'
import { SiteLikes } from './SiteLikes'
import { SiteZap } from './SiteZap'
import { useEscapeToHome } from './use-escape-to-home'
import { useSeekEvents } from './use-seek-events'
import { useVideoById } from './use-video-by-id'
import { videoPath } from './video-path'

/** One video at its own URL (`/v/<naddr>`), so it can be shared and opened directly. */
export function VideoView({
  config,
  gate,
  authorName,
  picture,
}: {
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
  picture?: string
}) {
  const { t } = useTranslation()
  const { id } = useParams()
  const lookup = useVideoById(id, config)
  const navigate = useNavigate()
  const video = lookup.status === 'found' ? lookup.video : null
  useEscapeToHome()

  useEffect(() => {
    if (video) document.title = `${video.title} – ${config.title}`
    return () => {
      document.title = config.title
    }
  }, [video, config.title])

  const crumb = (current?: ReactNode) => (
    <Breadcrumb title={config.title} picture={picture} current={current} />
  )
  const notice = (message: string) => (
    <div className="space-y-2">
      {crumb()}
      <p className="py-12 text-center text-muted-foreground">{message}</p>
    </div>
  )

  if (lookup.status === 'invalid') return notice(t('site.video.invalidLink'))
  if (lookup.status === 'not-found') return notice(t('site.video.notFound'))
  if (!video) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t('site.video.loading')}>
        {crumb(<Skeleton className="inline-block h-4 w-40 align-middle" />)}
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {crumb(video.title)}
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
    </div>
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
  const startAt = Math.max(0, Number.parseInt(searchParams.get('t') ?? '', 10) || 0)
  const [shareOpen, setShareOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(false)
  const [shareTime, setShareTime] = useState(startAt)
  const [currentTime, setCurrentTime] = useState(startAt)
  const [mediaElement, setMediaElement] = useState<HTMLMediaElement | null>(null)
  const updateTime = useCallback((time: number) => setCurrentTime(Math.floor(time)), [])
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
            key={video.id}
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
            initialPlayPos={startAt}
            onVideoElementReady={setMediaElement}
            onTimeUpdate={updateTime}
            chapters={chapters}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">{video.title}</h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(getPublishDate(video), i18n.resolvedLanguage)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SiteLikes video={video} relays={config.interactionRelays} />
          <SiteZap video={video} relays={config.interactionRelays} currentTime={currentTime} />
          <ShareButton
            shareOpen={shareOpen}
            setShareOpen={onShareOpenChange}
            shareUrl={shareUrl}
            shareLinks={shareLinks}
            includeTimestamp={includeTimestamp}
            setIncludeTimestamp={setIncludeTimestamp}
          />
        </div>
      </div>
      {/* Keyed by video, so another video starts collapsed again. */}
      {video.description && <Description key={video.id} video={video} links={links} />}
      {video.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('site.video.tags')}>
          {video.tags.map(tag => (
            <li key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
              #{tag}
            </li>
          ))}
        </ul>
      )}
      <Comments
        target={{
          videoId: video.id,
          authorPubkey: video.pubkey,
          videoKind: video.kind,
          identifier: video.identifier,
        }}
        links={links}
        relays={config.interactionRelays}
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
