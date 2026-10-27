import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19, type EventTemplate, type Filter, type NostrEvent } from 'nostr-tools'
import { lastValueFrom, toArray } from 'rxjs'
import { videoAddressOf } from '@nostube/core/comments'
import {
  isMuted,
  muteAuthor,
  muteEvent,
  MUTE_LIST_KIND,
  mutedOf,
  unmuteAuthor,
  unmuteEvent,
  type Muted,
  type MuteListEvent,
} from '@nostube/core/mute-list'
import { processEvent, type VideoEvent } from '@nostube/core/video-event'
import { getKindsForType } from '@nostube/core/video-types'
import { formatDate } from '@nostube/widgets'
import { Button } from '@nostube/widgets/components/button'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import type { AdminState } from './api'
import { isKeyConnected } from './draft'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { PageHeader } from './PageHeader'
import { useSigner } from './signer-context'
import { publishChecked, signChecked } from './upload/sign'

/** The comments on the owner's videos, and the owner's mute list that hides some of them on the site. */
export default function ModerationPage({ state }: { state: AdminState }) {
  const { t } = useTranslation()
  const { pubkey } = useSigner()
  const [booted, setBooted] = useState<InstanceClient | Error | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, e =>
      setBooted(e instanceof Error ? e : new Error(String(e)))
    )
  }, [])

  let body: ReactNode = null
  if (pubkey === null || !isKeyConnected(state.config, pubkey)) {
    // A creator that may not write (or a signer error): nothing to moderate with.
  } else if (booted === null) {
    body = <Skeleton className="h-40 w-full" />
  } else if (booted instanceof Error) {
    body = (
      <p className="text-sm text-muted-foreground">
        {t('studio.moderation.loadFailed', { message: booted.message })}
      </p>
    )
  } else {
    body = (
      <InstanceProviders client={booted.client} config={booted.config}>
        <Moderation booted={booted} owner={pubkey} />
      </InstanceProviders>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.moderation')}
        description={t('studio.moderation.description')}
      />
      {body}
    </div>
  )
}

interface Loaded {
  /** The owner's current mute list; null when there is none yet. */
  list: MuteListEvent | null
  videos: VideoEvent[]
  /** Newest first. */
  comments: NostrEvent[]
  /** Newest first; only reports (NIP-56, ADR 0011) that resolve to one of ours. */
  reports: NostrEvent[]
}

// ponytail: the newest 100 videos, 500 comments and 200 reports per query, no paging; add it
// when an instance outgrows that.
const VIDEO_LIMIT = 100
const COMMENT_LIMIT = 500
const REPORT_LIMIT = 200

/** Kind 1 (NIP-10) and kind 1111 (NIP-22) comments on any of the videos. */
function commentFilters(videos: VideoEvent[]): Filter[] {
  const ids = videos.map(v => v.id)
  const addresses = videos.flatMap(v => videoAddressOf(targetOf(v)) ?? [])
  return [
    { kinds: [1], '#e': ids, limit: COMMENT_LIMIT },
    { kinds: [1111], '#E': ids, limit: COMMENT_LIMIT },
    ...(addresses.length > 0
      ? [
          { kinds: [1], '#a': addresses, limit: COMMENT_LIMIT },
          { kinds: [1111], '#A': addresses, limit: COMMENT_LIMIT },
        ]
      : []),
  ]
}

const targetOf = (v: VideoEvent) => ({
  videoId: v.id,
  authorPubkey: v.pubkey,
  videoKind: v.kind,
  identifier: v.identifier,
})

/** The video a comment belongs to, by its id or address tags. */
function videoOf(comment: NostrEvent, videos: VideoEvent[]): VideoEvent | undefined {
  const refs = new Set(comment.tags.filter(t => /^[eEaA]$/.test(t[0])).map(t => t[1]))
  return videos.find(v => refs.has(v.id) || refs.has(videoAddressOf(targetOf(v)) ?? ''))
}

/** What a report (kind 1984) resolves to among the owner's own videos and comments. */
interface ReportInfo {
  report: NostrEvent
  reason?: string
  target:
    | { kind: 'video'; video: VideoEvent }
    | { kind: 'comment'; id: string; author: string }
    | { kind: 'profile'; pubkey: string }
}

/** A video's own media hashes: its primary `x` plus every variant's, video or thumbnail. */
function videoMediaHashes(video: VideoEvent): Set<string> {
  const hashes = new Set<string>()
  if (video.x) hashes.add(video.x.toLowerCase())
  for (const variant of [
    ...video.videoVariants,
    ...video.thumbnailVariants,
    ...(video.allVideoVariants ?? []),
  ]) {
    if (variant.hash) hashes.add(variant.hash.toLowerCase())
  }
  return hashes
}

/**
 * Resolves a report against what the studio already loaded, the same way the relay resolved it
 * on acceptance (ADR 0011): an `e` tag naming one of the owner's videos or comments; with no
 * `e`, a bare `x` naming one of the owner's videos by its media hash (the BUD-09 bridge's
 * fallback), or a `p` tag naming the owner or a visitor who has commented here. A report the
 * studio cannot place (an older comment outside `COMMENT_LIMIT`, say) is not shown rather than
 * guessed.
 */
function reportTarget(
  report: NostrEvent,
  videos: VideoEvent[],
  comments: NostrEvent[],
  owner: string
): ReportInfo | null {
  const eTag = report.tags.find(t => t[0] === 'e' && t[1])
  if (eTag) {
    const video = videos.find(v => v.id === eTag[1])
    if (video) return { report, reason: eTag[2], target: { kind: 'video', video } }
    const comment = comments.find(c => c.id === eTag[1])
    if (comment) {
      return {
        report,
        reason: eTag[2],
        target: { kind: 'comment', id: comment.id, author: comment.pubkey },
      }
    }
    return null
  }
  const xTag = report.tags.find(t => t[0] === 'x' && t[1])
  if (xTag) {
    const video = videos.find(v => videoMediaHashes(v).has(xTag[1].toLowerCase()))
    return video ? { report, reason: xTag[2], target: { kind: 'video', video } } : null
  }
  const pTag = report.tags.find(t => t[0] === 'p' && t[1])
  if (pTag && (pTag[1] === owner || comments.some(c => c.pubkey === pTag[1]))) {
    return { report, reason: pTag[2], target: { kind: 'profile', pubkey: pTag[1] } }
  }
  return null
}

function Moderation({ booted, owner }: { booted: InstanceClient; owner: string }) {
  const { t } = useTranslation()
  const { signer } = useSigner()
  const { client, config } = booted
  const [loaded, setLoaded] = useState<Loaded | Error | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    const collect = (relays: string[], filters: Filter[]) =>
      lastValueFrom(client.relayPool.request(relays, filters).pipe(toArray()))
    const load = async (): Promise<Loaded> => {
      // Only a completed read (relay EOSE) may be built on: an edit replaces the whole list.
      const lists = await collect(config.interactionRelays, [
        { kinds: [MUTE_LIST_KIND], authors: [owner] },
      ])
      const list = lists.reduce<NostrEvent | null>(
        (newest, e) => (!newest || e.created_at > newest.created_at ? e : newest),
        null
      )
      const videoEvents = await collect(config.videoSources, [
        { kinds: getKindsForType('all'), authors: [owner], limit: VIDEO_LIMIT },
      ])
      const videos = videoEvents.flatMap(e => processEvent(e, []) ?? [])
      if (videos.length === 0) return { list, videos, comments: [], reports: [] }
      const found = await collect(config.interactionRelays, commentFilters(videos))
      const comments = [...new Map(found.map(e => [e.id, e])).values()]
        .filter(e => videoOf(e, videos))
        .sort((a, b) => b.created_at - a.created_at)
      const foundReports = await collect(config.interactionRelays, [
        { kinds: [1984], limit: REPORT_LIMIT },
      ])
      const reports = [...new Map(foundReports.map(e => [e.id, e])).values()]
        .filter(e => reportTarget(e, videos, comments, owner))
        .sort((a, b) => b.created_at - a.created_at)
      return { list, videos, comments, reports }
    }
    load().then(
      result => current && setLoaded(result),
      e => current && setLoaded(e instanceof Error ? e : new Error(String(e)))
    )
    return () => {
      current = false
    }
  }, [client, config, owner])

  if (loaded === null) return <Skeleton className="h-40 w-full" />
  if (loaded instanceof Error) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('studio.moderation.loadFailed', { message: loaded.message })}
      </p>
    )
  }

  const { list, videos, comments, reports } = loaded
  const muted = mutedOf(list ? [list] : [])

  const change = async (next: (list: MuteListEvent | null) => EventTemplate) => {
    if (!signer) return setError(t('studio.errors.noSigner'))
    setBusy(true)
    setError(null)
    try {
      const signed = await signChecked(signer, next(list), owner)
      await publishChecked(
        client,
        config.interactionRelays,
        signed,
        'studio.errors.listNotAccepted'
      )
      setLoaded({ ...loaded, list: signed })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const authors = [...muted.pubkeys]
  const events = [...muted.events]

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-sm">
        <p className="font-medium break-all">
          {t('studio.moderation.listOf', { npub: nip19.npubEncode(owner) })}
        </p>
        <p className="text-muted-foreground">{t('studio.moderation.listNote')}</p>
        {list?.content && (
          <p className="text-muted-foreground">{t('studio.moderation.privateKept')}</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('studio.moderation.reports')}</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('studio.moderation.noReports')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {reports.map(report => {
              const info = reportTarget(report, videos, comments, owner)
              return info ? (
                <ReportRow
                  key={report.id}
                  info={info}
                  owner={owner}
                  muted={muted}
                  busy={busy}
                  onChange={next => void change(next)}
                />
              ) : null
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('studio.moderation.comments')}</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('studio.moderation.noComments')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {comments.map(comment => (
              <CommentRow
                key={comment.id}
                comment={comment}
                video={videoOf(comment, videos)}
                muted={muted}
                busy={busy}
                onChange={next => void change(next)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('studio.moderation.muteList')}</h3>
        {authors.length + events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('studio.moderation.emptyList')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {authors.map(pubkey => (
              <li key={`p:${pubkey}`} className="flex items-center gap-3 p-2">
                <Author pubkey={pubkey} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void change(l => unmuteAuthor(l, pubkey))}
                >
                  {t('studio.moderation.unmuteAuthor')}
                </Button>
              </li>
            ))}
            {events.map(id => (
              <li key={`e:${id}`} className="flex items-center gap-3 p-2">
                <p className="min-w-0 flex-1 truncate text-sm">
                  {comments.find(c => c.id === id)?.content ??
                    t('studio.moderation.unknownComment', { id: id.slice(0, 8) })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void change(l => unmuteEvent(l, id))}
                >
                  {t('studio.moderation.unmuteComment')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ReportRow({
  info,
  owner,
  muted,
  busy,
  onChange,
}: {
  info: ReportInfo
  owner: string
  muted: Muted
  busy: boolean
  onChange: (next: (list: MuteListEvent | null) => EventTemplate) => void
}) {
  const { t, i18n } = useTranslation()
  const { report, reason, target } = info
  // The owner cannot mute themself: a report on the creator's own account or reply offers
  // nothing to do here, the same way a video report points elsewhere instead of a button.
  const targetAuthor =
    target.kind === 'comment' ? target.author : target.kind === 'profile' ? target.pubkey : null
  const isOwner = targetAuthor === owner
  const handled =
    target.kind === 'comment'
      ? muted.events.has(target.id) || muted.pubkeys.has(target.author)
      : target.kind === 'profile'
        ? muted.pubkeys.has(target.pubkey)
        : false

  return (
    <li className={`space-y-2 p-3 ${handled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Author pubkey={report.pubkey} />
        <span className="text-xs text-muted-foreground">
          {formatDate(report.created_at, i18n.resolvedLanguage)}
          {handled ? ` · ${t('studio.moderation.reportHandled')}` : ''}
        </span>
      </div>
      <p className="text-sm font-medium">
        {target.kind === 'video'
          ? t('studio.moderation.reportTargetVideo', { title: target.video.title })
          : target.kind === 'comment'
            ? t('studio.moderation.reportTargetComment')
            : t('studio.moderation.reportTargetProfile')}
      </p>
      {reason && (
        <p className="text-sm text-muted-foreground">
          {t('studio.moderation.reportReason', { reason })}
        </p>
      )}
      {report.content && (
        <p className="line-clamp-4 text-sm break-words whitespace-pre-wrap">{report.content}</p>
      )}
      {target.kind === 'video' ? (
        <p className="text-sm text-muted-foreground">{t('studio.moderation.reportVideoNote')}</p>
      ) : isOwner ? (
        <p className="text-sm text-muted-foreground">{t('studio.moderation.reportSelfNote')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              const author = target.kind === 'comment' ? target.author : target.pubkey
              onChange(l =>
                muted.pubkeys.has(author) ? unmuteAuthor(l, author) : muteAuthor(l, author)
              )
            }}
          >
            {muted.pubkeys.has(target.kind === 'comment' ? target.author : target.pubkey)
              ? t('studio.moderation.unmuteAuthor')
              : t('studio.moderation.muteAuthor')}
          </Button>
          {target.kind === 'comment' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                onChange(l =>
                  muted.events.has(target.id) ? unmuteEvent(l, target.id) : muteEvent(l, target.id)
                )
              }
            >
              {muted.events.has(target.id)
                ? t('studio.moderation.unmuteComment')
                : t('studio.moderation.muteComment')}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function Author({ pubkey }: { pubkey: string }) {
  const profile = useProfile({ pubkey })
  const name = profile?.name || profile?.display_name || pubkey.slice(0, 8)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <UserAvatar picture={profile?.picture} pubkey={pubkey} name={name} className="h-8 w-8" />
      <span className="truncate text-sm font-medium">{name}</span>
    </div>
  )
}

function CommentRow({
  comment,
  video,
  muted,
  busy,
  onChange,
}: {
  comment: NostrEvent
  video?: VideoEvent
  muted: Muted
  busy: boolean
  onChange: (next: (list: MuteListEvent | null) => EventTemplate) => void
}) {
  const { t, i18n } = useTranslation()
  const authorMuted = muted.pubkeys.has(comment.pubkey)
  const commentMuted = muted.events.has(comment.id)
  const hidden = isMuted(comment, muted)
  return (
    <li className={`space-y-2 p-3 ${hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Author pubkey={comment.pubkey} />
        <span className="text-xs text-muted-foreground">
          {formatDate(comment.created_at, i18n.resolvedLanguage)}
          {video ? ` · ${t('studio.moderation.onVideo', { title: video.title })}` : ''}
          {hidden ? ` · ${t('studio.moderation.hidden')}` : ''}
        </span>
      </div>
      <p className="line-clamp-4 text-sm break-words whitespace-pre-wrap">{comment.content}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            onChange(l =>
              authorMuted ? unmuteAuthor(l, comment.pubkey) : muteAuthor(l, comment.pubkey)
            )
          }
        >
          {authorMuted ? t('studio.moderation.unmuteAuthor') : t('studio.moderation.muteAuthor')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            onChange(l => (commentMuted ? unmuteEvent(l, comment.id) : muteEvent(l, comment.id)))
          }
        >
          {commentMuted ? t('studio.moderation.unmuteComment') : t('studio.moderation.muteComment')}
        </Button>
      </div>
    </li>
  )
}
