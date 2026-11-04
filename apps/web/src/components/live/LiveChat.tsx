import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { nip19, type NostrEvent } from 'nostr-tools'
import { ArrowDown, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEventStore } from 'applesauce-react/hooks'
import { getDisplayName } from 'applesauce-core/helpers/profile'
import type { LiveStream } from '@nostube/core/live-stream'
import { fetchZapProviderPubkey, formatSats } from '@nostube/core/zap-utils'
import { genUserName } from '@nostube/core/gen-user-name'
import { Button } from '@nostube/widgets/components/button'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { requestProfile } from '@nostube/widgets/hooks/useBatchedProfiles'
import { useReportedPubkeys } from '@/hooks/useReportedPubkeys'
import { buildProfilePath } from '@/lib/nprofile'
import { cn } from '@/lib/utils'
import { buildChatRows, zapRecipients, zapRequestRecipient, type LiveZap } from './live-zaps'

const LARGE_ZAP_SATS = 5000

/** Recipient pubkey -> receipt-signing nostrPubkey of their own LNURL provider (null: none). */
function useZapProviders(pubkeysKey: string): ReadonlyMap<string, string | null> {
  const eventStore = useEventStore()
  const [providers, setProviders] = useState<ReadonlyMap<string, string | null>>(() => new Map())

  useEffect(() => {
    if (!pubkeysKey) return
    const controller = new AbortController()
    const subscriptions = pubkeysKey.split(',').map(pubkey => {
      requestProfile(pubkey)
      return eventStore.replaceable(0, pubkey).subscribe(profile => {
        if (!profile) return
        fetchZapProviderPubkey(profile, controller.signal)
          .catch(() => null)
          .then(provider => {
            if (!controller.signal.aborted) {
              setProviders(prev => new Map(prev).set(pubkey, provider))
            }
          })
      })
    })
    return () => {
      controller.abort()
      subscriptions.forEach(subscription => subscription.unsubscribe())
    }
  }, [eventStore, pubkeysKey])

  return providers
}

function formatTime(seconds: number, language: string) {
  return new Date(seconds * 1000).toLocaleTimeString(language, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ChatMessage({ event }: { event: NostrEvent }) {
  const { i18n } = useTranslation()
  const profile = useProfile({ pubkey: event.pubkey })
  const name = getDisplayName(profile, genUserName(event.pubkey))
  const profilePath = buildProfilePath(nip19.npubEncode(event.pubkey))

  return (
    <li className="flex gap-2 py-1.5" data-live-chat-row="chat" data-event-id={event.id}>
      <Link to={profilePath} tabIndex={-1} aria-hidden className="mt-0.5 shrink-0">
        <UserAvatar
          picture={profile?.picture}
          pubkey={event.pubkey}
          name={name}
          className="h-6 w-6"
        />
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-baseline gap-2">
          <Link
            to={profilePath}
            className="truncate font-medium text-muted-foreground hover:underline"
          >
            {name}
          </Link>
          <time
            dateTime={new Date(event.created_at * 1000).toISOString()}
            className="shrink-0 text-xs text-muted-foreground/70"
          >
            {formatTime(event.created_at, i18n.language)}
          </time>
        </div>
        <p className="whitespace-pre-wrap wrap-anywhere">{event.content}</p>
      </div>
    </li>
  )
}

function ZapMessage({ zap }: { zap: LiveZap }) {
  const { t, i18n } = useTranslation()
  const profile = useProfile(zap.sender ? { pubkey: zap.sender } : undefined)
  const sats = Math.round(zap.msats / 1000)
  const large = sats >= LARGE_ZAP_SATS
  const name = zap.sender
    ? getDisplayName(profile, genUserName(zap.sender))
    : t('liveChat.anonymous', 'Anonymous')

  return (
    <li className="py-1.5" data-live-chat-row="zap" data-event-id={zap.id} data-zap-sats={sats}>
      <div
        className={cn(
          'rounded-xl border px-3 py-2 text-sm',
          large ? 'border-amber-500/70 bg-amber-500/20' : 'border-amber-500/30 bg-amber-500/10'
        )}
      >
        <div className="flex items-center gap-2">
          {zap.sender ? (
            <Link
              to={buildProfilePath(nip19.npubEncode(zap.sender))}
              className="flex min-w-0 items-center gap-2 font-medium hover:underline"
            >
              <UserAvatar
                picture={profile?.picture}
                pubkey={zap.sender}
                name={name}
                className="h-6 w-6 shrink-0"
              />
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
          <time
            dateTime={new Date(zap.createdAt * 1000).toISOString()}
            className="ml-auto shrink-0 text-xs text-muted-foreground"
          >
            {formatTime(zap.createdAt, i18n.language)}
          </time>
        </div>
        {zap.comment && <p className="mt-1 whitespace-pre-wrap wrap-anywhere">{zap.comment}</p>}
      </div>
    </li>
  )
}

/** Read-only NIP-53 chat: kind 1311 messages plus NIP-57-verified zaps. Never publishes. */
export function LiveChat({
  stream,
  events,
  isLoading,
  error,
}: {
  stream: LiveStream
  events: NostrEvent[]
  isLoading: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  const reported = useReportedPubkeys()
  const recipients = useMemo(() => zapRecipients(stream), [stream])

  // Only resolve LNURL providers for recipients that zaps actually target.
  const pubkeysKey = useMemo(() => {
    const keys = new Set<string>()
    for (const event of events) {
      const recipient = event.kind === 9735 ? zapRequestRecipient(event, recipients) : undefined
      if (recipient) keys.add(recipient)
    }
    return [...keys].sort().join(',')
  }, [events, recipients])
  const providers = useZapProviders(pubkeysKey)

  const rows = useMemo(
    () =>
      buildChatRows(events, stream, recipients, providers).filter(row =>
        row.type === 'chat'
          ? !reported?.[row.event.pubkey]
          : !row.zap.sender || !reported?.[row.zap.sender]
      ),
    [events, stream, recipients, providers, reported]
  )

  // Follow new messages only while the reader is at the bottom.
  const listRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  useLayoutEffect(() => {
    const list = listRef.current
    if (pinned && list) list.scrollTop = list.scrollHeight
  }, [rows, pinned])

  return (
    <section className="flex h-full min-h-0 flex-col" data-live-chat>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('liveChat.title', 'Live chat')}</h2>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {t('liveChat.readOnly', 'Read only')}
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          role="log"
          aria-label={t('liveChat.messages', 'Chat messages')}
          tabIndex={0}
          className="h-full overflow-y-auto px-3 py-2"
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
                  <ChatMessage key={row.event.id} event={row.event} />
                ) : (
                  <ZapMessage key={row.zap.invoice} zap={row.zap} />
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
    </section>
  )
}
