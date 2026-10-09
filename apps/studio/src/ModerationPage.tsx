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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import type { AdminState } from './api'
import { isKeyConnected } from './draft'
import { bootInstanceClient, type InstanceClient } from './instance-client'
import { useSigner } from './signer-context'
import { publishChecked, signChecked } from './upload/sign'

/** The comments on the owner's videos, and the owner's mute list that hides some of them on the site. */
export default function ModerationPage({
  state,
  banner,
}: {
  state: AdminState
  banner: ReactNode
}) {
  const { t } = useTranslation()
  const { status, pubkey, connect } = useSigner()
  const [booted, setBooted] = useState<InstanceClient | Error | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  useEffect(() => {
    bootInstanceClient().then(setBooted, e =>
      setBooted(e instanceof Error ? e : new Error(String(e)))
    )
  }, [])

  // The banner asks for the key when the instance has no creator yet; otherwise ask here.
  const bannerAsks = state.config.creators.length === 0 || state.config.allowedWriters.length === 0
  const connectNow = async () => {
    setConnectError(null)
    try {
      await connect()
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e))
    }
  }

  let body: ReactNode = null
  if (pubkey === null) {
    if (!bannerAsks) {
      body = (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{t('studio.moderation.connectFirst')}</p>
          {status === 'none' && <p>{t('studio.connect.noSigner')}</p>}
          {connectError && <p className="text-destructive">{connectError}</p>}
          <Button type="button" onClick={connectNow} disabled={status !== 'ready'}>
            {t('studio.connect.connect')}
          </Button>
        </div>
      )
    }
  } else if (!isKeyConnected(state.config, pubkey)) {
    // The banner says that this key is no creator yet and offers to add it.
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
      {banner}
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.moderation.title')}</CardTitle>
          <CardDescription>{t('studio.moderation.description')}</CardDescription>
        </CardHeader>
        {body && <CardContent>{body}</CardContent>}
      </Card>
    </div>
  )
}

interface Loaded {
  /** The owner's current mute list; null when there is none yet. */
  list: MuteListEvent | null
  videos: VideoEvent[]
  /** Newest first. */
  comments: NostrEvent[]
}

// ponytail: the newest 100 videos and 500 comments per query, no paging; add it when an
// instance outgrows that.
const VIDEO_LIMIT = 100
const COMMENT_LIMIT = 500

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
      if (videos.length === 0) return { list, videos, comments: [] }
      const found = await collect(config.interactionRelays, commentFilters(videos))
      const comments = [...new Map(found.map(e => [e.id, e])).values()]
        .filter(e => videoOf(e, videos))
        .sort((a, b) => b.created_at - a.created_at)
      return { list, videos, comments }
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

  const { list, videos, comments } = loaded
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
