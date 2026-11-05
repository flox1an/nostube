import { TrustBadgeDisplay } from '@/components/TrustBadge'
import { useTrustScores } from '@/hooks/useTrustScore'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { kinds, type NostrEvent } from 'nostr-tools'
import { getDisplayName, getProfileContent } from 'applesauce-core/helpers/profile'
import type { LiveStream } from '@nostube/core/live-stream'
import { buildChatRows, zapRecipients } from '@nostube/core/live-zaps'
import {
  lnurlFromProfile,
  resolveZapEndpoint,
  type ZapEndpoint,
  type ZapReceipt,
} from '@nostube/core/lnurl-pay'
import { formatSats } from '@nostube/core/zap-utils'
import { genUserName } from '@nostube/core/gen-user-name'
import { Button } from '@nostube/widgets/components/button'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { requestProfile } from '@nostube/widgets/hooks/useBatchedProfiles'
import { useBlockedPubkeys } from '@/hooks/useReportedPubkeys'
import { useMutedPubkeys, resolveMutedPubkeys } from '@/hooks/useMutedPubkeys'
import { buildProfileUrl, buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { cn } from '@/lib/utils'
import { useLiveChat } from '@/hooks/useLiveChat'
import { LiveChatComposer } from './LiveChatComposer'
import { LiveChatSettings } from './LiveChatSettings'
import {
  normalizeChatAppearance,
  DEFAULT_CHAT_APPEARANCE,
  type ChatAppearance,
} from './chat-appearance'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { RichTextContent } from '@/components/RichTextContent'
import { formatChatTime } from './chat-time'

const LARGE_ZAP_SATS = 5000

/** Recipient pubkey -> LNURL endpoint from their own profile, for zaps that can be verified. */
function useZapEndpoints(recipients: string[]): ReadonlyMap<string, ZapEndpoint> {
  const eventStore = useEventStore()
  const [endpoints, setEndpoints] = useState<ReadonlyMap<string, ZapEndpoint>>(() => new Map())
  const key = recipients.join(',')

  useEffect(() => {
    const controller = new AbortController()
    const subscriptions = (key ? key.split(',') : []).map(pubkey => {
      requestProfile(pubkey)
      return eventStore.replaceable(kinds.Metadata, pubkey).subscribe(profile => {
        const lnurl = profile && lnurlFromProfile(getProfileContent(profile) ?? {})
        if (!lnurl) return
        resolveZapEndpoint(lnurl, controller.signal)
          .then(endpoint => {
            if (endpoint.nostrPubkey && !controller.signal.aborted)
              setEndpoints(prev => new Map(prev).set(pubkey, endpoint))
          })
          .catch(() => {})
      })
    })
    return () => {
      controller.abort()
      subscriptions.forEach(subscription => subscription.unsubscribe())
    }
  }, [eventStore, key])

  return endpoints
}

function ChatMessage({
  event,
  appearance,
  relays,
  trust,
}: {
  event: NostrEvent
  appearance: ChatAppearance
  relays: string[]
  trust: number | null | undefined
}) {
  const profile = useProfile({ pubkey: event.pubkey })
  const name = getDisplayName(profile, genUserName(event.pubkey))
  const profilePath = buildProfileUrl(event.pubkey, event, relays)

  return (
    <li
      className="px-2 py-1 leading-relaxed wrap-anywhere hover:bg-accent/40"
      data-live-chat-row="chat"
      data-event-id={event.id}
    >
      {appearance.timestamps && (
        <time
          dateTime={new Date(event.created_at * 1000).toISOString()}
          className="mr-2 text-[0.8em] text-muted-foreground"
        >
          {formatChatTime(event.created_at)}
        </time>
      )}
      {appearance.showTrust && (
        <TrustBadgeDisplay pubkey={event.pubkey} score={trust} className="mr-1 align-[-1px]" />
      )}
      <Link
        to={profilePath}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'font-semibold hover:underline',
          appearance.coloredNames &&
            [
              'text-violet-700 dark:text-violet-300',
              'text-emerald-700 dark:text-emerald-300',
              'text-sky-700 dark:text-sky-300',
              'text-rose-700 dark:text-rose-300',
              'text-orange-700 dark:text-orange-300',
              'text-fuchsia-700 dark:text-fuchsia-300',
            ][parseInt(event.pubkey.slice(0, 2), 16) % 6]
        )}
      >
        {name}
      </Link>
      <span aria-hidden="true" className="text-muted-foreground">
        :{' '}
      </span>
      <RichTextContent content={event.content} authorPubkey={event.pubkey} inline />
    </li>
  )
}

function ZapMessage({
  zap,
  appearance,
  relays,
}: {
  zap: ZapReceipt
  appearance: ChatAppearance
  relays: string[]
}) {
  const { t } = useTranslation()
  const profile = useProfile(zap.sender ? { pubkey: zap.sender } : undefined)
  const sats = zap.sats
  const large = sats >= LARGE_ZAP_SATS
  const name = zap.sender
    ? getDisplayName(profile, genUserName(zap.sender))
    : t('liveChat.anonymous', 'Anonymous')

  return (
    <li className="py-1.5" data-live-chat-row="zap" data-event-id={zap.id} data-zap-sats={sats}>
      <div
        className={cn(
          'rounded-xl border px-3 py-2',
          large ? 'border-amber-500/70 bg-amber-500/20' : 'border-amber-500/30 bg-amber-500/10'
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {zap.sender ? (
            <Link
              to={buildProfileUrlFromPubkey(zap.sender, relays)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 font-semibold wrap-anywhere hover:underline"
            >
              <span className="truncate">{name}</span>
            </Link>
          ) : (
            <span className="truncate font-medium">{name}</span>
          )}
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 font-semibold text-amber-700 dark:text-amber-300',
              large && 'text-base'
            )}
          >
            <Zap className="h-4 w-4 fill-current" aria-hidden />
            {t('liveChat.zapAmount', {
              defaultValue: 'zapped {{amount}} sats',
              amount: formatSats(sats),
            })}
          </span>
        </div>
        {appearance.timestamps && (
          <time
            dateTime={new Date(zap.createdAt * 1000).toISOString()}
            className="text-[0.8em] text-muted-foreground"
          >
            {formatChatTime(zap.createdAt)}
          </time>
        )}
        {zap.comment && (
          <div className="mt-1">
            <RichTextContent content={zap.comment} authorPubkey={zap.sender} inline />
          </div>
        )}
      </div>
    </li>
  )
}

/** NIP-53 chat: kind 1311 messages plus NIP-57-verified zaps, with a composer for signed-in users. */
export function LiveChat({ stream }: { stream: LiveStream }) {
  const { events, isLoading, error, relays } = useLiveChat(stream)
  const [storedAppearance, setAppearance] = useLocalStorage(
    'nostube:live-chat-appearance',
    DEFAULT_CHAT_APPEARANCE
  )
  const appearance = normalizeChatAppearance(storedAppearance)
  const { t } = useTranslation()
  const blocked = useBlockedPubkeys()
  const { mutedPubkeys } = useMutedPubkeys()
  const eventStore = useEventStore()
  // The streamer's NIP-51 mute list; the store's loader fetches it when missing.
  const hostMuteList = use$(
    () => eventStore.replaceable(kinds.Mutelist, stream.hostPubkey),
    [eventStore, stream.hostPubkey]
  )
  const { user } = useCurrentUser()
  const hidden = useMemo(() => {
    const set = new Set(Object.keys(blocked ?? {}))
    if (appearance.hideMuted) {
      for (const pubkey of mutedPubkeys) set.add(pubkey)
      for (const pubkey of resolveMutedPubkeys(hostMuteList, [])) set.add(pubkey)
    }
    return set
  }, [blocked, mutedPubkeys, hostMuteList, appearance.hideMuted])
  const chatAuthors = useMemo(
    () => [...new Set(events.filter(e => e.kind === 1311).map(e => e.pubkey))],
    [events]
  )
  const trustScores = useTrustScores(
    appearance.showTrust || appearance.minTrust > 0 ? chatAuthors : []
  )
  // Unscored accounts stay visible; the streamer and the viewer are never filtered by trust.
  const trustHidden = (pubkey: string) => {
    if (appearance.minTrust === 0 || pubkey === stream.hostPubkey || pubkey === user?.pubkey)
      return false
    const score = trustScores.get(pubkey)
    return typeof score === 'number' && score < appearance.minTrust
  }
  // Resolve recipients' LNURL endpoints only once a zap receipt shows up.
  const hasZaps = useMemo(() => events.some(event => event.kind === kinds.Zap), [events])
  const recipients = useMemo(() => (hasZaps ? zapRecipients(stream) : []), [hasZaps, stream])
  const endpoints = useZapEndpoints(recipients)

  const rows = useMemo(
    () =>
      buildChatRows(events, stream, endpoints).filter(row =>
        row.type === 'chat'
          ? !hidden.has(row.event.pubkey) && !trustHidden(row.event.pubkey)
          : !row.zap.sender || !hidden.has(row.zap.sender)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trustHidden reads trustScores/minTrust
    [events, stream, endpoints, hidden, trustScores, appearance.minTrust, user?.pubkey]
  )

  // Follow new messages only while the reader is at the bottom.
  const listRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  useLayoutEffect(() => {
    const list = listRef.current
    if (pinned && list) list.scrollTop = list.scrollHeight
  }, [rows, pinned])
  // The list shrinks when the composer grows (or the viewport changes); stay on the latest.
  useEffect(() => {
    const list = listRef.current
    if (!pinned || !list) return
    const observer = new ResizeObserver(() => {
      list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [pinned])

  return (
    <section className="flex h-full min-h-0 flex-col" data-live-chat>
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          role="log"
          aria-label={t('liveChat.messages', 'Chat messages')}
          tabIndex={0}
          className="h-full overflow-y-auto py-1"
          style={{ fontSize: appearance.fontSize }}
          onScroll={event => {
            const list = event.currentTarget
            setPinned(list.scrollHeight - list.scrollTop - list.clientHeight < 32)
          }}
        >
          {error && (
            <p
              role="alert"
              className="my-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"
            >
              {t('liveChat.error', 'Chat could not be loaded from relays.')}
            </p>
          )}
          {rows.length === 0 ? (
            !error && (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                {isLoading
                  ? t('liveChat.loading', 'Loading chat…')
                  : t('liveChat.empty', 'No messages yet')}
              </p>
            )
          ) : (
            <ol>
              {rows.map(row =>
                row.type === 'chat' ? (
                  <ChatMessage
                    key={row.event.id}
                    event={row.event}
                    appearance={appearance}
                    relays={relays}
                    trust={trustScores.get(row.event.pubkey)}
                  />
                ) : (
                  <ZapMessage
                    key={row.zap.bolt11}
                    zap={row.zap}
                    appearance={appearance}
                    relays={relays}
                  />
                )
              )}
            </ol>
          )}
        </div>

        {!pinned && rows.length > 0 && (
          <Button
            size="sm"
            className="absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 rounded-full shadow-md"
            onClick={() => setPinned(true)}
          >
            <ArrowDown className="mr-1.5 h-4 w-4" aria-hidden />
            {t('liveChat.jumpToLatest', 'Jump to latest')}
          </Button>
        )}
      </div>
      <LiveChatComposer
        stream={stream}
        relays={relays}
        onSent={() => setPinned(true)}
        settings={
          <LiveChatSettings naddr={stream.naddr} appearance={appearance} onChange={setAppearance} />
        }
      />
    </section>
  )
}
