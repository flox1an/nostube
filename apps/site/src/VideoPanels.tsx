import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextTrack } from '@nostube/core/video-event'
import type { VideoChapter } from '@nostube/core/video-chapters'
import {
  activeCueIndex,
  parseTranscript,
  searchTranscript,
  type TranscriptCue,
} from '@nostube/core/transcript'
import { formatDuration } from '@nostube/widgets'
import { cn } from '@nostube/widgets/cn'
import { Input } from '@nostube/widgets/components/input'

/**
 * Moves the player to `time` and starts it: the reader asked to watch from there. `onJump` lets
 * the page show the new position at once, before the browser has finished seeking.
 */
function jump(element: HTMLMediaElement | null, time: number, onJump: (time: number) => void) {
  if (!element) return
  onJump(time)
  element.currentTime = time
  void Promise.resolve(element.play()).catch(() => {})
}

/** The description's chapters as a list: the current one is marked, each one a seek. */
export function ChapterList({
  chapters,
  currentTime,
  element,
  onJump,
}: {
  chapters: VideoChapter[]
  currentTime: number
  element: HTMLMediaElement | null
  onJump: (time: number) => void
}) {
  const { t } = useTranslation()
  if (chapters.length === 0) return null
  let active = 0
  chapters.forEach((chapter, index) => {
    if (chapter.startTime <= currentTime) active = index
  })
  return (
    <section className="space-y-2" aria-labelledby="chapter-list">
      <h2 id="chapter-list" className="text-sm font-semibold">
        {t('site.watch.chapters')}
      </h2>
      <ol className="divide-y rounded-md border">
        {chapters.map((chapter, index) => (
          <li key={chapter.startTime}>
            <button
              type="button"
              aria-current={index === active ? 'true' : undefined}
              onClick={() => jump(element, chapter.startTime, onJump)}
              className={cn(
                'flex min-h-11 w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
                index === active && 'bg-accent font-medium'
              )}
            >
              <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                {formatDuration(chapter.startTime)}
              </span>
              <span className="min-w-0 break-words">{chapter.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

type Load =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; cues: TranscriptCue[] }

/** The track in the reader's language, else the first one. */
export function pickTrack(tracks: TextTrack[], language: string): TextTrack | undefined {
  const base = language.split('-')[0].toLowerCase()
  return tracks.find(track => track.lang.split('-')[0].toLowerCase() === base) ?? tracks[0]
}

/**
 * The subtitles as readable, searchable text. Only existing subtitles are shown, nothing is
 * generated; the file is fetched when the reader opens the panel.
 */
export function Transcript({
  tracks,
  currentTime,
  element,
  onJump,
}: {
  tracks: TextTrack[]
  currentTime: number
  element: HTMLMediaElement | null
  onJump: (time: number) => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const track = useMemo(
    () => pickTrack(tracks, i18n.resolvedLanguage ?? 'en'),
    [tracks, i18n.resolvedLanguage]
  )
  const url = track?.url

  useEffect(() => {
    if (!open || !url) return
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(String(response.status))
        return response.text()
      })
      .then(text => setLoad({ status: 'ready', cues: parseTranscript(text) }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'failed' })
      })
    return () => controller.abort()
  }, [open, url])

  const cues = useMemo(() => (load.status === 'ready' ? load.cues : []), [load])
  const shown = useMemo(() => searchTranscript(cues, query), [cues, query])
  const active = activeCueIndex(cues, currentTime)
  const activeCue = active >= 0 ? cues[active] : undefined
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the current line in view, inside the list only: the page itself never scrolls for it.
  useEffect(() => {
    if (!open || query || !activeCue || !listRef.current) return
    const item = listRef.current.querySelector<HTMLElement>('[aria-current="true"]')
    const box = listRef.current
    if (!item) return
    if (
      item.offsetTop < box.scrollTop ||
      item.offsetTop + item.offsetHeight > box.scrollTop + box.clientHeight
    )
      box.scrollTop = item.offsetTop - box.clientHeight / 2
  }, [open, query, activeCue])

  if (!track) return null
  return (
    <section className="space-y-2" aria-labelledby="transcript-toggle">
      <h2 className="text-sm font-semibold">
        <button
          id="transcript-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="transcript-panel"
          onClick={() => setOpen(value => !value)}
          className="min-h-11 rounded-md underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t(open ? 'site.watch.hideTranscript' : 'site.watch.showTranscript')}
        </button>
      </h2>
      {open && (
        <div id="transcript-panel" className="space-y-2">
          {load.status === 'loading' && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('site.watch.transcriptLoading')}
            </p>
          )}
          {load.status === 'failed' && (
            <p role="alert" className="text-sm text-destructive">
              {t('site.watch.transcriptFailed')}
            </p>
          )}
          {load.status === 'ready' && cues.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('site.watch.transcriptEmpty')}</p>
          )}
          {cues.length > 0 && (
            <>
              <Input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t('site.watch.transcriptSearch')}
                aria-label={t('site.watch.transcriptSearch')}
              />
              {shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('site.watch.transcriptNoMatch', { query })}
                </p>
              ) : (
                <ul
                  ref={listRef}
                  className="relative max-h-80 divide-y overflow-y-auto rounded-md border"
                >
                  {shown.map((cue, index) => (
                    <li
                      key={`${cue.start}:${index}`}
                      aria-current={cue === activeCue ? 'true' : undefined}
                    >
                      <button
                        type="button"
                        onClick={() => jump(element, cue.start, onJump)}
                        className={cn(
                          'flex min-h-11 w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
                          cue === activeCue && 'bg-accent font-medium'
                        )}
                      >
                        <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                          {formatDuration(Math.floor(cue.start))}
                        </span>
                        <span className="min-w-0 whitespace-pre-line break-words">{cue.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
