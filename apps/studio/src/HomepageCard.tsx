import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { toHiddenVideoRef, videoRef } from '@nostube/core/hidden-videos'
import { noSiteHomepage, type SiteHomepage } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { Button } from '@nostube/widgets/components/button'
import { Card, CardContent } from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { Textarea } from '@nostube/widgets/components/textarea'
import { useCreatorVideos } from '@nostube/widgets/hooks/useCreatorVideos'
import { useVideoSearch } from '@nostube/widgets/hooks/useVideoSearch'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { HOMEPAGE_LIMITS, isRefHidden } from './draft'
import { Field } from './fields'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { usePinnedVideos } from '@nostube/widgets/hooks/usePinnedVideos'
import { replaceVideoPins, loadPinList } from '@nostube/core/pin-list'
import { useSigner } from './signer-context'
import { signAndPublish } from './upload/sign'
import { useVideosByRef } from '@nostube/widgets/hooks/useVideosByRef'

/** The loaded video a homepage choice names (by its address or its id), if loaded. */
export const findVideo = (videos: VideoEvent[], ref: string) =>
  videos.find(v => videoRef(v) === ref || v.id === ref)

/** The thumbnail to show, never one behind a content warning. */
export const safeThumbnail = (video: VideoEvent | undefined) =>
  video && !video.contentWarning ? (video.thumbnailVariants[0]?.url ?? video.images[0]) : undefined

interface HomepageCardProps {
  /** Absent until the creator configures the homepage. */
  homepage: SiteHomepage | undefined
  hiddenText: string
  onChange: (homepage: SiteHomepage) => void
  /** The creator's videos loaded so far: titles and thumbnails for the choices and the preview. */
  videos: VideoEvent[]
  onVideos: (videos: VideoEvent[]) => void
  instance: InstanceClient
  onPins: (refs: string[]) => void
}

/** Intro, featured video and note, ordered selection, named links and the main button. */
export function HomepageCard({
  homepage,
  hiddenText,
  onChange,
  videos,
  onVideos,
  instance,
  onPins,
}: HomepageCardProps) {
  const { t } = useTranslation()
  const pins = usePinnedVideos(instance.config)
  const { signer, pubkey } = useSigner()
  const [edited, setEdited] = useState<string[] | null>(null)
  const baseId = useRef<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const resolvedRefs = useMemo(() => pins.videos.map(videoRef), [pins.videos])
  const selected = edited ?? resolvedRefs
  const chosen = useVideosByRef(instance.config, selected)
  const editPins = (refs: string[]) => {
    if (edited === null) baseId.current = pins.event?.id
    setEdited(refs)
  }
  const h = { ...(homepage ?? noSiteHomepage()), selected }
  const set = (patch: Partial<SiteHomepage> & { selected?: string[] }) => {
    const { selected: refs, ...presentation } = patch
    if (refs) editPins(refs)
    if (Object.keys(presentation).length)
      onChange({ ...(homepage ?? noSiteHomepage()), ...presentation })
  }
  useEffect(() => {
    onPins(selected)
  }, [selected, onPins])
  const hidden = (ref: string) => isRefHidden(hiddenText, ref)
  const full = selected.length >= HOMEPAGE_LIMITS.selected
  const choose = (ref: string) => editPins([...selected, ref])
  const move = (from: number, to: number) => {
    const next = [...selected]
    ;[next[from], next[to]] = [next[to], next[from]]
    editPins(next)
  }
  const savePins = async () => {
    if (!signer || pubkey !== instance.config.startPage?.creator || busy || !pins.ready) return
    setBusy(true)
    setProblem('')
    try {
      if (
        selected.length > HOMEPAGE_LIMITS.selected ||
        selected.some(ref => {
          const video = chosen.get(ref) ?? findVideo(pins.videos, ref) ?? findVideo(videos, ref)
          return (
            !video ||
            video.pubkey !== pubkey ||
            hidden(ref) ||
            hidden(video.id) ||
            hidden(videoRef(video))
          )
        })
      )
        throw new Error(t('studio.homepage.pinInvalid'))
      const latest = await loadPinList(
        instance.client.relayPool,
        instance.config.videoSources,
        pubkey
      )
      if (latest?.id !== baseId.current) throw new Error(t('studio.homepage.pinsChanged'))
      const controlled = pins.videos.flatMap(v => [v.id, videoRef(v)])
      const { signed } = await signAndPublish(
        instance.client,
        instance.config.videoSources,
        signer,
        {
          kind: 10001,
          created_at: Math.max(Math.floor(Date.now() / 1000), (latest?.created_at ?? 0) + 1),
          content: latest?.content ?? '',
          tags: replaceVideoPins(
            latest?.tags ?? [],
            controlled,
            selected,
            instance.config.videoSources[0]
          ),
        },
        pubkey,
        'studio.errors.listNotAccepted',
        t('studio.homepage.savePins')
      )
      instance.client.eventStore.add(signed)
      setEdited(null)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  const titleOf = (ref: string) => chosen.get(ref)?.title || findVideo(videos, ref)?.title || ref
  const setLink = (i: number, patch: Partial<SiteHomepage['links'][number]>) =>
    set({ links: h.links.map((l, n) => (n === i ? { ...l, ...patch } : l)) })

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          <Field
            id="home-intro"
            label={t('studio.homepage.intro')}
            hint={<Count text={h.intro} max={HOMEPAGE_LIMITS.intro} />}
          >
            <Textarea
              id="home-intro"
              rows={4}
              value={h.intro}
              onChange={e => set({ intro: e.target.value })}
            />
          </Field>

          <Field
            id="home-featured-text"
            label={t('studio.homepage.featuredText')}
            hint={<Count text={h.featuredText} max={HOMEPAGE_LIMITS.note} />}
          >
            <Textarea
              id="home-featured-text"
              rows={2}
              value={h.featuredText}
              onChange={e => set({ featuredText: e.target.value })}
            />
          </Field>

          <section className="space-y-2" aria-labelledby="home-selected">
            <h3 id="home-selected" className="text-sm font-medium">
              {t('studio.homepage.selected')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('studio.homepage.selectedHint', { max: HOMEPAGE_LIMITS.selected })}{' '}
              {t('studio.homepage.pinHint')}
            </p>
            {h.selected.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('studio.homepage.selectedNone')}</p>
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {h.selected.map((ref, i) => {
                  const title = titleOf(ref)
                  return (
                    <ChoiceRow
                      key={ref}
                      video={chosen.get(ref) ?? findVideo(videos, ref)}
                      choice={ref}
                      hidden={hidden(ref)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={i === 0}
                        aria-label={t('studio.homepage.moveUp', { title })}
                        onClick={() => move(i, i - 1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={i === h.selected.length - 1}
                        aria-label={t('studio.homepage.moveDown', { title })}
                        onClick={() => move(i, i + 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('studio.homepage.remove', { title })}
                        onClick={() => set({ selected: h.selected.filter(r => r !== ref) })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </ChoiceRow>
                  )
                })}
              </ol>
            )}
            <Button
              type="button"
              disabled={
                busy ||
                !pins.ready ||
                !signer ||
                pubkey !== instance.config.startPage?.creator ||
                edited === null
              }
              onClick={savePins}
            >
              {t('studio.homepage.savePins')}
            </Button>
            {(!signer || pubkey !== instance.config.startPage?.creator) && (
              <p>{t('studio.homepage.pinSigner')}</p>
            )}
            {(problem || pins.error) && (
              <p role="alert" className="text-destructive">
                {problem || pins.error}
              </p>
            )}
          </section>

          <section className="space-y-2" aria-labelledby="home-choose">
            <h3 id="home-choose" className="text-sm font-medium">
              {t('studio.homepage.choose')}
            </h3>
            <VideoChoices
              homepage={h}
              hidden={hidden}
              full={full}
              onChoose={choose}
              onVideos={onVideos}
            />
            <PasteChoice homepage={h} hidden={hidden} full={full} onChoose={choose} />
          </section>

          <section className="space-y-2" aria-labelledby="home-links">
            <h3 id="home-links" className="text-sm font-medium">
              {t('studio.homepage.links')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('studio.homepage.linksHint', { max: HOMEPAGE_LIMITS.links })}
            </p>
            {h.links.map((link, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <Input
                  aria-label={t('studio.homepage.linkLabel', { n: i + 1 })}
                  placeholder={t('studio.homepage.labelPlaceholder')}
                  value={link.label}
                  onChange={e => setLink(i, { label: e.target.value })}
                  className="sm:w-48"
                />
                <Input
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  aria-label={t('studio.homepage.linkUrl', { n: i + 1 })}
                  placeholder="https://"
                  value={link.url}
                  onChange={e => setLink(i, { url: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('studio.homepage.removeLink', { n: i + 1 })}
                  onClick={() => set({ links: h.links.filter((_, n) => n !== i) })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={h.links.length >= HOMEPAGE_LIMITS.links}
              onClick={() => set({ links: [...h.links, { label: '', url: '' }] })}
            >
              {t('studio.homepage.addLink')}
            </Button>
          </section>

          <section className="space-y-2" aria-labelledby="home-action">
            <h3 id="home-action" className="text-sm font-medium">
              {t('studio.homepage.action')}
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={h.action !== null}
                onChange={e => set({ action: e.target.checked ? { label: '', url: '' } : null })}
              />
              {t('studio.homepage.actionToggle')}
            </label>
            <p className="text-xs text-muted-foreground">{t('studio.homepage.actionHint')}</p>
            {h.action && (
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <Input
                  aria-label={t('studio.homepage.actionLabel')}
                  placeholder={t('studio.homepage.labelPlaceholder')}
                  value={h.action.label}
                  onChange={e => set({ action: { ...h.action!, label: e.target.value } })}
                  className="sm:w-48"
                />
                <Input
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  aria-label={t('studio.homepage.actionUrl')}
                  placeholder="https://"
                  value={h.action.url}
                  onChange={e => set({ action: { ...h.action!, url: e.target.value } })}
                />
              </div>
            )}
          </section>
        </fieldset>
      </CardContent>
    </Card>
  )
}

/** Characters used of the limit, as the server counts them (Unicode characters, trimmed). */
function Count({ text, max }: { text: string; max: number }) {
  const { t } = useTranslation()
  const used = [...text.trim()].length
  return (
    <span className={used > max ? 'text-destructive' : undefined}>
      {t('studio.homepage.count', { used, max })}
    </span>
  )
}

function ChoiceRow({
  video,
  choice,
  hidden,
  children,
}: {
  video: VideoEvent | undefined
  choice: string
  hidden: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const thumbnail = safeThumbnail(video)
  return (
    <li className="flex list-none items-center gap-3 p-2">
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded bg-muted">
        {thumbnail && (
          <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {video ? (
          <p className="line-clamp-2 break-words text-sm font-medium">{video.title}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('studio.homepage.unknownVideo')}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{choice}</p>
          </>
        )}
        {hidden && <p className="text-xs text-destructive">{t('studio.homepage.hiddenChoice')}</p>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </li>
  )
}

interface ChoiceProps {
  homepage: { selected: string[] }
  hidden: (ref: string) => boolean
  full: boolean
  onChoose: (ref: string) => void
}

/** The creator's videos, a page at a time, to feature or add; hidden ones cannot be picked. */
function VideoChoices(props: ChoiceProps & { onVideos: (videos: VideoEvent[]) => void }) {
  const { t } = useTranslation()
  const [booted, setBooted] = useState<InstanceClient | Error | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, e =>
      setBooted(e instanceof Error ? e : new Error(String(e)))
    )
  }, [])

  if (booted === null) return <Skeleton className="h-40 w-full" />
  if (booted instanceof Error) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('studio.videos.loadFailedWith', { message: booted.message })}
      </p>
    )
  }
  return (
    <InstanceProviders client={booted.client} config={booted.config}>
      <ChoiceList config={booted.config} {...props} />
    </InstanceProviders>
  )
}

function ChoiceList({
  config,
  homepage,
  hidden,
  full,
  onChoose,
  onVideos,
}: ChoiceProps & { config: InstanceClient['config']; onVideos: (videos: VideoEvent[]) => void }) {
  const { t } = useTranslation()
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config)
  const [query, setQuery] = useState('')
  const search = useVideoSearch(config, query)
  const searching = query.trim() !== ''
  useEffect(() => onVideos(videos), [videos, onVideos])

  if (!config.startPage) {
    return <p className="text-sm text-muted-foreground">{t('studio.videos.addCreator')}</p>
  }
  if (loading) return <Skeleton className="h-40 w-full" />
  if (error) return <p className="text-sm text-destructive">{t('studio.videos.loadFailed')}</p>
  if (videos.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('studio.videos.emptyHint')}</p>
  }
  const shown = searching ? search.videos : videos
  const more = searching ? search.hasMore && !search.paging : hasMore

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('studio.videos.search')}
        aria-label={t('studio.videos.search')}
      />
      {searching && search.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : searching && search.error ? (
        <p className="text-sm text-destructive">{t('studio.videos.loadFailed')}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('studio.videos.noMatch')}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {shown.map(video => {
            const ref = videoRef(video)
            const isHidden = hidden(ref) || hidden(video.id)
            const added = homepage.selected.includes(ref) || homepage.selected.includes(video.id)
            return (
              <ChoiceRow key={ref} video={video} choice={ref} hidden={isHidden}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  disabled={isHidden || added || full}
                  aria-label={t('studio.homepage.addVideo', { title: video.title })}
                  onClick={() => onChoose(ref)}
                >
                  {added ? t('studio.homepage.isAdded') : t('studio.homepage.add')}
                </Button>
              </ChoiceRow>
            )
          })}
        </ul>
      )}
      {full && (
        <p className="text-xs text-muted-foreground">
          {t('studio.homepage.full', { max: HOMEPAGE_LIMITS.selected })}
        </p>
      )}
      {more && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={searching ? search.loadMore : loadMore}
        >
          {t('studio.videos.loadMore')}
        </Button>
      )}
    </div>
  )
}

/** An older video, or one not loaded yet, by its link: stored in the canonical form. */
function PasteChoice({ homepage, hidden, full, onChoose }: ChoiceProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const pick = () => {
    const ref = toHiddenVideoRef(text)
    const reason = !ref
      ? 'pasteInvalid'
      : hidden(ref)
        ? 'pasteHidden'
        : homepage.selected.includes(ref)
          ? 'pasteAdded'
          : full
            ? 'full'
            : null
    setProblem(reason && t(`studio.homepage.${reason}`, { max: HOMEPAGE_LIMITS.selected }))
    if (reason || !ref) return
    onChoose(ref)
    setText('')
  }
  return (
    <Field
      id="home-paste"
      label={t('studio.homepage.paste')}
      hint={
        problem ? (
          <span role="alert" className="text-destructive">
            {problem}
          </span>
        ) : (
          t('studio.homepage.pasteHint')
        )
      }
    >
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <Input
          id="home-paste"
          spellCheck={false}
          value={text}
          onChange={e => {
            setText(e.target.value)
            setProblem(null)
          }}
        />
        <Button type="button" variant="outline" disabled={!text.trim()} onClick={pick}>
          {t('studio.homepage.add')}
        </Button>
      </div>
    </Field>
  )
}
