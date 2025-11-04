import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { useCurrentUser, useNostrPublish, useProfile, useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import React, { useMemo, useState, useEffect } from 'react'
import { formatDistance } from 'date-fns'
import { NostrEvent } from 'nostr-tools'
import { imageProxy, nowInSecs } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { map } from 'rxjs/operators'
import { createTimelineLoader } from 'applesauce-loaders/loaders'

interface Comment {
  id: string
  content: string
  pubkey: string
  created_at: number
}

interface VideoCommentsProps {
  videoId: string
  authorPubkey: string
  link: string
  /**
   * Relays to use for loading comments. If not provided, uses app config read relays.
   */
  relays?: string[]
}

function mapEventToComment(event: NostrEvent): Comment {
  return {
    id: event.id,
    content: event.content,
    pubkey: event.pubkey,
    created_at: event.created_at,
  }
}

function renderCommentContent(content: string, link: string) {
  // Regex to match mm:ss timestamps (optionally h:mm:ss)
  const timestampRegex = /\b(?:(\d+):)?(\d{1,2}):(\d{2})\b/g
  const baseUrl = `/video/${link}`
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = timestampRegex.exec(content)) !== null) {
    const [full, h, m, s] = match
    const start = match.index
    const end = start + full.length
    // Push preceding text
    if (start > lastIndex) {
      parts.push(content.slice(lastIndex, start))
    }
    // Calculate seconds
    const hours = h ? parseInt(h, 10) : 0
    const minutes = parseInt(m, 10)
    const seconds = parseInt(s, 10)
    const totalSeconds = hours * 3600 + minutes * 60 + seconds
    // Push link
    parts.push(
      <Link
        key={`ts-${start}`}
        to={`${baseUrl}?t=${totalSeconds}`}
        className="text-primary hover:text-primary/80 cursor-pointer"
      >
        {full}
      </Link>
    )
    lastIndex = end
  }
  // Push any remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  return parts
}

const CommentItem = React.memo(function CommentItem({
  comment,
  link,
}: {
  comment: Comment
  link: string
}) {
  const metadata = useProfile({ pubkey: comment.pubkey })
  const name = metadata?.name || comment.pubkey.slice(0, 8)

  return (
    <div className="flex gap-4 mb-6">
      <Avatar>
        <AvatarImage src={imageProxy(metadata?.picture)} />
        <AvatarFallback>{name[0]}</AvatarFallback>
      </Avatar>
      <div>
        <div className="flex items-center gap-2">
          <div className="font-semibold">{name}</div>
          <div className="text-sm text-muted-foreground">
            {formatDistance(new Date(comment.created_at * 1000), new Date(), {
              addSuffix: true,
            })}
          </div>
        </div>
        <div className="mt-1 break-all">{renderCommentContent(comment.content, link)}</div>
      </div>
    </div>
  )
})

export function VideoComments({ videoId, link, authorPubkey, relays }: VideoCommentsProps) {
  const [newComment, setNewComment] = useState('')
  const eventStore = useEventStore()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const { pool, config } = useAppContext()

  // Use provided relays or fallback to app config read relays
  const readRelays = useMemo(() => {
    if (relays && relays.length > 0) {
      return relays
    }
    return config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
  }, [relays, config.relays])

  const filters = useMemo(
    () => [
      {
        kinds: [1],
        '#e': [videoId],
        limit: 100,
      },
      {
        kinds: [1111],
        '#E': [videoId],
        limit: 100,
      },
    ],
    [videoId]
  )

  // Load comments from relays when filters change
  useEffect(() => {
    const loader = createTimelineLoader(pool, readRelays, filters, { limit: 50, eventStore })
    const subscription = loader().subscribe(e => eventStore.add(e))

    // Cleanup subscription on unmount or filters change
    return () => subscription.unsubscribe()
  }, [pool, readRelays, filters, eventStore])

  // Use EventStore timeline to get comments for this video
  const comments$ = useMemo(() => {
    return eventStore.timeline(filters).pipe(map(events => events.map(mapEventToComment)))
  }, [eventStore, filters])

  const comments = useObservableState(comments$, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newComment.trim()) return

    const draftEvent = {
      kind: 1111,
      content: newComment,
      created_at: nowInSecs(),
      tags: [
        ['E', videoId],
        ['P', authorPubkey],
        ['e', videoId],
        ['p', authorPubkey],
        ['client', 'nostube'],
      ],
    }

    try {
      const signedEvent = await publish({
        event: draftEvent,
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      })

      // Add the comment to the event store immediately for instant feedback
      eventStore.add(signedEvent)

      setNewComment('')
    } catch (error) {
      console.error('Failed to publish comment:', error)
    }
  }

  return (
    <>
      <h2 className="mb-4">Comments</h2>
      {user && (
        <form onSubmit={handleSubmit} className="mb-8">
          <Textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="mb-2"
          />
          <Button type="submit" disabled={!newComment.trim()}>
            Comment
          </Button>
        </form>
      )}

      <div>
        {comments.map(comment => (
          <CommentItem key={comment.id} comment={comment} link={link} />
        ))}
      </div>
    </>
  )
}
