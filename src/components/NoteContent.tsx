import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import { useProfile } from '@/hooks/useProfile'
import { genUserName } from '@/lib/genUserName'
import { cn } from '@/lib/utils'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { buildProfilePath, buildProfileUrlFromPubkey } from '@/lib/nprofile'

// Define a simple Event interface that matches what we need
interface Event {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

interface NoteContentProps {
  event: Event
  className?: string
}

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({ event, className }: NoteContentProps) {
  // Process the content to render mentions, links, etc.
  const content = useMemo(() => {
    const text = event.content

    // Regex to find URLs, Nostr references, and hashtags
    const regex =
      /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g

    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    let keyCounter = 0

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, url, nostrPrefix, nostrData, hashtag] = match
      const index = match.index

      // Add text before this match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index))
      }

      if (url) {
        // Handle URLs
        parts.push(
          <a
            key={`url-${keyCounter++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {url}
          </a>
        )
      } else if (nostrPrefix && nostrData) {
        // Handle Nostr references
        const nostrId = `${nostrPrefix}${nostrData}`
        let decodedData: { type: string; pubkey?: string; relays?: string[] } | null = null

        try {
          const decoded = nip19.decode(nostrId)
          if (decoded.type === 'npub') {
            decodedData = { type: 'npub', pubkey: decoded.data }
          } else if (decoded.type === 'nprofile') {
            const { pubkey, relays } = decoded.data
            decodedData = { type: 'nprofile', pubkey, relays }
          } else {
            decodedData = { type: 'other' }
          }
        } catch {
          // If decoding fails, will render as text
        }

        if (decodedData?.type === 'npub' && decodedData.pubkey) {
          parts.push(
            <NostrMention
              key={`mention-${keyCounter++}`}
              profilePointer={{ pubkey: decodedData.pubkey }}
            />
          )
        } else if (decodedData?.type === 'nprofile' && decodedData.pubkey) {
          parts.push(
            <NostrMention
              key={`mention-${keyCounter++}`}
              profilePointer={{ pubkey: decodedData.pubkey, relays: decodedData.relays }}
            />
          )
        } else if (decodedData?.type === 'other') {
          parts.push(
            <Link
              key={`nostr-${keyCounter++}`}
              to={`/${nostrId}`}
              className="text-blue-500 hover:underline"
            >
              {fullMatch}
            </Link>
          )
        } else {
          // If decoding failed, just render as text
          parts.push(fullMatch)
        }
      } else if (hashtag) {
        // Handle hashtags
        const tag = hashtag.slice(1) // Remove the #
        parts.push(
          <Link
            key={`hashtag-${keyCounter++}`}
            to={`/t/${tag}`}
            className="text-blue-500 hover:underline"
          >
            {hashtag}
          </Link>
        )
      }

      lastIndex = index + fullMatch.length
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    // If no special content was found, just use the plain text
    if (parts.length === 0) {
      parts.push(text)
    }

    return parts
  }, [event])

  return (
    <div className={cn('whitespace-pre-wrap break-words', className)}>
      {content.length > 0 ? content : event.content}
    </div>
  )
}

// Helper component to display user mentions
function NostrMention({
  profilePointer,
}: {
  profilePointer: { pubkey: string; relays?: string[] }
}) {
  const author = useProfile(profilePointer)
  const eventStore = useEventStore()
  const displayName = author?.display_name || author?.name || genUserName(profilePointer.pubkey)

  // Generate nprofile link with relays if available
  const nprofileLink = useMemo(() => {
    // Try to get the profile event to extract seen relays
    const profileEvent = eventStore.getReplaceable(0, profilePointer.pubkey)
    const seenRelaysSet = profileEvent ? getSeenRelays(profileEvent) : undefined
    const seenRelays = seenRelaysSet ? Array.from(seenRelaysSet) : []
    const relays = profilePointer.relays || seenRelays

    if (relays && relays.length > 0) {
      return buildProfileUrlFromPubkey(profilePointer.pubkey, relays)
    } else {
      const npub = nip19.npubEncode(profilePointer.pubkey)
      return buildProfilePath(npub)
    }
  }, [eventStore, profilePointer.pubkey, profilePointer.relays])

  return (
    <Link to={nprofileLink} className="font-medium hover:underline text-primary">
      @{displayName}
    </Link>
  )
}
