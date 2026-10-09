import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { useActiveAccount } from 'applesauce-react/hooks'
import { map } from 'rxjs/operators'
import type { NostrEvent } from 'nostr-tools'
import {
  buildCommentDeletionTags,
  buildCommentFilters,
  buildCommentReplyTags,
  buildLegacyReplyTags,
  buildTopLevelCommentTags,
  mapEventToComment,
  buildCommentTree,
  type Comment,
  type CommentTarget,
} from '@nostube/core/comments'
import { useNostubeHost } from '@nostube/widgets/host'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { Button } from '@nostube/widgets/components/button'
import { CommentInput } from '@nostube/widgets/components/CommentInput'
import { CommentSkeleton } from '@nostube/widgets/components/comments/CommentSkeleton'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { RichTextContent, type RichTextLinks } from '@nostube/widgets/components/RichTextContent'
import { AuthDialog } from '@nostube/widgets/components/auth/AuthDialog'
import { useTimelineContext } from '@nostube/widgets/timeline'
import { formatDate } from '@nostube/widgets'
import { useVisitorProfile } from './use-visitor-profile'

const RELAY_HINT = ''

/** The signed-in visitor, shown beside the comment and reply inputs. */
interface Viewer {
  pubkey: string
  name?: string
  picture?: string
}

/** The video's comment section: visitors read anonymously and sign in to comment or reply. */
export function Comments({
  target,
  links,
  relays,
}: {
  target: CommentTarget
  links: RichTextLinks
  relays: string[]
}) {
  const { t } = useTranslation()
  const { pool } = useNostubeHost()
  const eventStore = useEventStore()
  const account = useActiveAccount()
  const { client } = useTimelineContext()
  const visitor = useVisitorProfile(client, account?.pubkey)
  const viewer: Viewer | undefined = account
    ? { pubkey: account.pubkey, name: visitor?.name, picture: visitor?.picture }
    : undefined
  const [authOpen, setAuthOpen] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())

  const filters = useMemo(() => buildCommentFilters(target), [target])
  const { videoId } = target

  // Load comments; the request completes on relay EOSE.
  useEffect(() => {
    setIsLoading(true)
    const subscription = pool.request(relays, filters).subscribe({
      next: e => eventStore.add(e),
      complete: () => setIsLoading(false),
      error: () => setIsLoading(false),
    })
    return () => subscription.unsubscribe()
  }, [pool, relays, filters, eventStore])

  // Second pass: replies by external clients that only tag the parent comment.
  const commentIds = use$(
    () =>
      eventStore.timeline(filters).pipe(
        map(events =>
          events
            .map(e => e.id)
            .sort()
            .join(',')
        )
      ),
    [eventStore, filters]
  )
  useEffect(() => {
    if (!commentIds) return
    const subscription = pool
      .request(relays, [{ kinds: [1], '#e': commentIds.split(','), limit: 100 }])
      .subscribe(e => eventStore.add(e))
    return () => subscription.unsubscribe()
  }, [pool, relays, commentIds, eventStore])

  const allFilters = useMemo(() => {
    if (!commentIds) return filters
    return [...filters, { kinds: [1], '#e': commentIds.split(','), limit: 100 }]
  }, [filters, commentIds])

  const threaded = use$(
    () =>
      eventStore.timeline(allFilters).pipe(
        map(events => events.map(e => mapEventToComment(e, videoId))),
        map(buildCommentTree)
      ),
    [eventStore, allFilters, videoId]
  )

  const publish = async (draft: { kind: number; content: string; tags: string[][] }) => {
    if (!account) throw new Error(t('site.comments.signInFirst'))
    const signed = await account.signer.signEvent({
      kind: draft.kind,
      content: draft.content,
      tags: [...draft.tags, ['client', 'nostube']],
      created_at: Math.floor(Date.now() / 1000),
    })
    // The relay answers per relay; an explicit OK(false) must not count as success.
    const results = await pool.publish(relays, signed as unknown as NostrEvent)
    const refused = results.filter(r => !r.ok)
    if (results.length > 0 && refused.length === results.length) {
      // Relay messages are the relays' own words; only the missing-reason fallback is ours.
      throw new Error(
        refused.map(r => `${r.from}: ${r.message ?? t('site.comments.refused')}`).join('; ')
      )
    }
    eventStore.add(signed as unknown as NostrEvent)
    return signed
  }

  const submit = async (content: string, parent: Comment | null) => {
    setBusy(true)
    setError(null)
    try {
      if (parent) {
        const builder =
          parent.kind === 1
            ? buildLegacyReplyTags(target, { id: parent.id, pubkey: parent.pubkey }, RELAY_HINT)
            : buildCommentReplyTags(target, { id: parent.id, pubkey: parent.pubkey }, RELAY_HINT)
        await publish({ kind: parent.kind === 1 ? 1 : 1111, content, tags: builder })
      } else {
        await publish({
          kind: 1111,
          content,
          tags: buildTopLevelCommentTags(target, RELAY_HINT),
        })
      }
      if (parent) {
        setReplyTo(null)
        setReplyContent('')
      } else {
        setNewComment('')
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setError(t('site.comments.postFailed', { reason }))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (comment: Comment) => {
    setBusy(true)
    setError(null)
    try {
      await publish({
        kind: 5,
        content: 'Deleted by author',
        tags: buildCommentDeletionTags(comment.id, comment.kind),
      })
      // The event store keeps serving the deleted event until the deletion arrives from a
      // relay query, so hide it right away.
      setRemoved(previous => new Set(previous).add(comment.id))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setError(t('site.comments.deleteFailed', { reason }))
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const drop = (comments: Comment[]): Comment[] =>
      comments
        .filter(comment => !removed.has(comment.id))
        .map(comment => ({
          ...comment,
          replies: comment.replies ? drop(comment.replies) : undefined,
        }))
    return drop(threaded ?? [])
  }, [threaded, removed])

  return (
    <section className="space-y-4" aria-label={t('site.comments.title')}>
      <h3 className="text-sm font-semibold">
        {threaded?.length
          ? t('site.comments.count', { count: threaded.length })
          : t('site.comments.title')}
      </h3>

      {account ? (
        <CommentInput
          value={newComment}
          onChange={setNewComment}
          onSubmit={e => {
            e.preventDefault()
            if (newComment.trim()) void submit(newComment, null)
          }}
          disabled={busy}
          userAvatar={viewer?.picture}
          userName={viewer?.name}
          userPubkey={viewer?.pubkey}
        />
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setAuthOpen(true)}>
            {t('site.comments.signInToComment')}
          </Button>
          <AuthDialog
            isOpen={authOpen}
            onClose={() => setAuthOpen(false)}
            onLogin={() => setAuthOpen(false)}
            relays={relays}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoading && threaded?.length === 0 && <CommentSkeleton />}

      <ul className="space-y-2">
        {visible.map(comment => (
          <li key={comment.id}>
            <SiteComment
              comment={comment}
              links={links}
              signedIn={!!account}
              ownPubkey={account?.pubkey}
              viewer={viewer}
              replyingTo={replyTo}
              replyContent={replyContent}
              busy={busy}
              onReplyRequest={requested => {
                setReplyTo(requested)
                setReplyContent('')
              }}
              onReplyContentChange={setReplyContent}
              onSubmitReply={(parent, content) => {
                if (content.trim()) void submit(content, parent)
              }}
              onCancelReply={() => setReplyTo(null)}
              onDeleteRequest={comment_ => void remove(comment_)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One comment with its nested replies; every handler is bound to this node's comment. */
function SiteComment({
  comment,
  links,
  signedIn,
  ownPubkey,
  viewer,
  replyingTo,
  replyContent,
  busy,
  onReplyRequest,
  onReplyContentChange,
  onSubmitReply,
  onCancelReply,
  onDeleteRequest,
}: {
  comment: Comment
  links: RichTextLinks
  signedIn: boolean
  ownPubkey?: string
  viewer?: Viewer
  replyingTo: Comment | null
  replyContent: string
  busy: boolean
  onReplyRequest: (comment: Comment) => void
  onReplyContentChange: (content: string) => void
  onSubmitReply: (parent: Comment, content: string) => void
  onCancelReply: () => void
  onDeleteRequest: (comment: Comment) => void
}) {
  const { t, i18n } = useTranslation()
  const profile = useProfile({ pubkey: comment.pubkey })
  const name = profile?.name || comment.pubkey.slice(0, 8)
  const isOwn = ownPubkey === comment.pubkey
  const replying = replyingTo?.id === comment.id

  return (
    <div className="flex gap-3 pb-4">
      <UserAvatar
        picture={profile?.picture}
        pubkey={comment.pubkey}
        name={name}
        className="h-8 w-8 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(comment.created_at, i18n.resolvedLanguage)}
          </span>
          {signedIn && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => onReplyRequest(comment)}
              >
                {t('site.comments.reply')}
              </Button>
              {isOwn && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  disabled={busy}
                  onClick={() => onDeleteRequest(comment)}
                >
                  {t('site.comments.delete')}
                </Button>
              )}
            </>
          )}
        </div>
        <RichTextContent
          content={comment.content}
          authorPubkey={comment.pubkey}
          links={links}
          className="text-sm break-words [&_a]:text-primary [&_a]:underline-offset-2 [&_a:hover]:underline"
        />
        {replying && (
          <div className="mt-2">
            <CommentInput
              value={replyContent}
              onChange={onReplyContentChange}
              onSubmit={e => {
                e.preventDefault()
                onSubmitReply(comment, replyContent)
              }}
              onCancel={onCancelReply}
              disabled={busy}
              userAvatar={viewer?.picture}
              userName={viewer?.name}
              userPubkey={viewer?.pubkey}
              autoFocus
            />
          </div>
        )}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2 border-l pl-4">
            {comment.replies.map(reply => (
              <SiteComment
                key={reply.id}
                comment={reply}
                links={links}
                signedIn={signedIn}
                ownPubkey={ownPubkey}
                viewer={viewer}
                replyingTo={replyingTo}
                replyContent={replyContent}
                busy={busy}
                onReplyRequest={onReplyRequest}
                onReplyContentChange={onReplyContentChange}
                onSubmitReply={onSubmitReply}
                onCancelReply={onCancelReply}
                onDeleteRequest={onDeleteRequest}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
