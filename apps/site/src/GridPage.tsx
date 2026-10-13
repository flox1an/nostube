import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { searchVideos } from '@nostube/core/video-search'
import { VideoGrid, VideoGridSkeleton } from '@nostube/widgets'
import { Alert, AlertDescription } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { AgeConfirm } from './AgeConfirm'
import type { AgeGate } from './use-age-gate'
import { useCreatorVideos } from './use-creator-videos'
import { videoPath } from './video-path'

/**
 * Video cards that link to their pages; a locked video asks for 18+ before its page opens.
 * On a phone the cards run edge to edge: the page's side padding is cancelled here.
 */
export function VideoLinks({
  videos,
  gate,
  emptyMessage,
}: {
  videos: VideoEvent[]
  gate: AgeGate
  emptyMessage?: string
}) {
  const [pending, setPending] = useState<VideoEvent | null>(null)
  const navigate = useNavigate()

  const select = (video: VideoEvent) => {
    if (gate.isLocked(video)) setPending(video)
    else navigate(videoPath(video))
  }
  const confirmAge = () => {
    gate.confirm()
    if (pending) navigate(videoPath(pending))
    setPending(null)
  }

  return (
    <>
      {pending && <AgeConfirm onConfirm={confirmAge} onCancel={() => setPending(null)} />}
      <div className="-mx-4 sm:mx-0">
        <VideoGrid
          videos={videos}
          onSelect={select}
          isLocked={gate.isLocked}
          getHref={videoPath}
          emptyMessage={emptyMessage}
        />
      </div>
    </>
  )
}

/** A heading under a link back to all videos (a tag's or a search's page). */
function SubPageHeading({ children }: { children: string }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('site.tag.back')}
      </Link>
      <h2 className="text-xl font-semibold">{children}</h2>
    </div>
  )
}

function LoadFailed() {
  const { t } = useTranslation()
  return (
    <Alert variant="destructive" className="flex items-center justify-between gap-4">
      <AlertDescription>{t('site.grid.loadFailed')}</AlertDescription>
      <Button type="button" variant="outline" size="sm" onClick={() => location.reload()}>
        {t('site.grid.retry')}
      </Button>
    </Alert>
  )
}

const gridSkeleton = (
  <div className="-mx-4 sm:mx-0">
    <VideoGridSkeleton />
  </div>
)

/** The grid of the creator's videos, at `/t/<tag>` only those with that tag. */
export function GridPage({ config, gate }: { config: InstanceConfig; gate: AgeGate }) {
  const { t } = useTranslation()
  const { tag } = useParams()
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config, tag)

  return (
    <>
      {tag && <SubPageHeading>{t('site.tag.title', { tag })}</SubPageHeading>}
      {error && <LoadFailed />}
      {loading ? (
        gridSkeleton
      ) : (
        <>
          <VideoLinks videos={videos} gate={gate} />
          {hasMore && (
            <div className="text-center">
              <Button type="button" variant="outline" onClick={loadMore}>
                {t('site.grid.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}

/**
 * `/search?q=`: the shown videos (the grid's, without the hidden ones) that match the query. The
 * whole catalog is paged in, since a match may be on any page. A locked video matches on its title
 * only, the one thing its card shows before the age gate.
 */
export function SearchPage({ config, gate }: { config: InstanceConfig; gate: AgeGate }) {
  const { t } = useTranslation()
  const query = (useSearchParams()[0].get('q') ?? '').trim()
  const { videos, error, hasMore, pagesLoaded, loadMore } = useCreatorVideos(config)
  // Page in the whole catalog, one page after the other (loadMore does nothing while one loads).
  // Keyed on the page count, not on a loading flag: a page that starts and ends in one render
  // batch never shows the flag, and paging would stop.
  useEffect(() => {
    if (hasMore && !error) loadMore()
  }, [hasMore, error, loadMore, pagesLoaded])
  const found = useMemo(
    () => searchVideos(videos, query, v => (gate.isLocked(v) ? v.title : v.searchText)),
    [videos, query, gate]
  )

  if (!query) return <Navigate to="/" replace />
  return (
    <>
      <SubPageHeading>{t('site.search.title', { query })}</SubPageHeading>
      {error && <LoadFailed />}
      {found.length === 0 && hasMore && !error ? (
        gridSkeleton
      ) : (
        <VideoLinks videos={found} gate={gate} emptyMessage={t('site.search.empty', { query })} />
      )}
    </>
  )
}

/**
 * The site's search in the header: an icon until clicked, then a box that opens `/search?q=`.
 * It stays open with the query on the results page; empty, it folds back on blur or Escape. On a
 * phone the open box covers the header row (the title would not fit next to it).
 */
export function SearchBox() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [open, setOpen] = useState(query !== '')
  const toggle = useRef<HTMLButtonElement>(null)
  // Closed with Escape: the icon replaces the box, so the keyboard focus moves there.
  const refocus = useRef(false)
  useEffect(() => {
    if (open || !refocus.current) return
    refocus.current = false
    toggle.current?.focus()
  }, [open])
  if (!open) {
    return (
      <Button
        ref={toggle}
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        aria-label={t('site.search.label')}
        onClick={() => setOpen(true)}
      >
        <Search />
      </Button>
    )
  }
  return (
    <form
      role="search"
      className="absolute inset-0 z-10 flex items-center bg-background sm:static sm:bg-transparent"
      onSubmit={e => {
        e.preventDefault()
        const q = query.trim()
        if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
      }}
    >
      <Input
        type="search"
        // Opened by a click on the icon: typing can start right away.
        autoFocus={query === ''}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => {
          if (!query.trim()) setOpen(false)
        }}
        onKeyDown={e => {
          if (e.key !== 'Escape') return
          setQuery('')
          refocus.current = true
          setOpen(false)
        }}
        placeholder={t('site.search.placeholder')}
        aria-label={t('site.search.label')}
        className="h-9 w-full sm:w-64"
      />
    </form>
  )
}
