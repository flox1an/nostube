import { useMemo, useEffect } from 'react'
import { combineLatest, of } from 'rxjs'
import { map, startWith } from 'rxjs/operators'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { nip19, kinds } from 'nostr-tools'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { genUserName } from '@/lib/genUserName'
import { useAppContext } from '@/hooks/useAppContext'
import { requestProfile } from '@/hooks/useBatchedProfiles'
import type { VideoNote } from '@/hooks/useVideoNotes'

interface Mention {
  token: string // full "nostr:npub1..." match to replace
  pubkey: string
  relays: string[]
}

const NOSTR_REGEX = /nostr:(npub1|nprofile1)([023456789acdefghjklmnpqrstuvwxyz]+)/g

function parseMentions(text: string): Mention[] {
  const seen = new Set<string>()
  const mentions: Mention[] = []
  let m: RegExpExecArray | null

  NOSTR_REGEX.lastIndex = 0
  while ((m = NOSTR_REGEX.exec(text)) !== null) {
    const token = m[0]
    try {
      const decoded = nip19.decode(`${m[1]}${m[2]}`)
      let pubkey: string
      let relays: string[] = []
      if (decoded.type === 'npub') {
        pubkey = decoded.data
      } else if (decoded.type === 'nprofile') {
        pubkey = decoded.data.pubkey
        relays = decoded.data.relays ?? []
      } else {
        continue
      }
      if (!seen.has(pubkey)) {
        seen.add(pubkey)
        mentions.push({ token, pubkey, relays })
      }
    } catch {
      // malformed — skip
    }
  }
  return mentions
}

/**
 * Derives a plain-text title from the first non-empty line of a note's content,
 * replacing nostr:npub / nostr:nprofile mentions with resolved display names.
 * Returns the raw first line immediately and updates reactively as profiles load.
 */
export function useFirstLineTitle(note: VideoNote | null): string {
  const eventStore = useEventStore()
  const { pool } = useAppContext()

  const { firstLine, mentions, mentionKey } = useMemo(() => {
    if (!note) return { firstLine: '', mentions: [] as Mention[], mentionKey: '' }
    const firstLine = note.content.split('\n').find(l => l.trim()) ?? ''
    const mentions = parseMentions(firstLine)
    return { firstLine, mentions, mentionKey: mentions.map(m => m.pubkey).join(',') }
  }, [note])

  // Trigger profile loading for each mention (relay-aware)
  useEffect(() => {
    for (const { pubkey, relays } of mentions) {
      if (eventStore.hasReplaceable(kinds.Metadata, pubkey)) continue
      if (relays.length > 0) {
        const loader = createTimelineLoader(
          pool,
          relays,
          { kinds: [kinds.Metadata], authors: [pubkey] },
          { eventStore, limit: 1 }
        )
        loader().subscribe({ error: err => console.error('[useFirstLineTitle]', err) })
      } else {
        requestProfile(pubkey)
      }
    }
    // mentionKey is the stable string-keyed dep for mentions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionKey, eventStore, pool])

  // Subscribe to all profiles reactively, emit resolved name map
  const nameMap = use$(
    () => {
      if (!mentions.length) return of({} as Record<string, string>)
      return combineLatest(
        mentions.map(({ pubkey }) =>
          eventStore.profile(pubkey).pipe(
            startWith(undefined),
            map(profile => {
              const name = profile?.display_name || profile?.name || genUserName(pubkey)
              return [pubkey, name] as const
            })
          )
        )
      ).pipe(map(pairs => Object.fromEntries(pairs)))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mentionKey, eventStore]
  )

  return useMemo(() => {
    if (!firstLine) return ''
    if (!mentions.length) return firstLine.trim()
    let result = firstLine
    for (const { token, pubkey } of mentions) {
      const name = nameMap?.[pubkey]
      if (name) result = result.replace(token, `@${name}`)
    }
    return result.trim()
  }, [firstLine, mentions, nameMap])
}
