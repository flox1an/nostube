import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SendHorizontal } from 'lucide-react'
import type { LiveStream } from '@nostube/core/live-stream'
import { Button } from '@nostube/widgets/components/button'
import { Textarea } from '@nostube/widgets/components/textarea'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { nowInSecs } from '@/lib/utils'

type ComposerProps = {
  stream: LiveStream
  relays: string[]
  onSent?: () => void
  /** Extra controls (chat settings) shown beside Send, or beside sign-in for guests. */
  settings?: ReactNode
}

/** Grow to content; CSS max-height caps it and the textarea scrolls beyond. */
function fitHeight(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
}

/** NIP-53 kind 1311 chat composer. Guests get a sign-in prompt instead of a field. */
export function LiveChatComposer(props: ComposerProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const [authOpen, setAuthOpen] = useState(false)

  if (user) {
    // Remount per stream and account so a draft never carries over to either.
    return <SignedInComposer key={`${props.stream.address}:${user.pubkey}`} {...props} />
  }

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-t pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
      data-live-composer
    >
      <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => setAuthOpen(true)}>
        {t('liveChat.signIn', 'Sign in to chat')}
      </Button>
      {props.settings}
      <AuthDialog
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={() => setAuthOpen(false)}
      />
    </div>
  )
}

function SignedInComposer({ stream, relays, onSent, settings }: ComposerProps) {
  const { t } = useTranslation()
  const { publish } = useNostrPublish()
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous guard: state lags a fast double Ctrl+Enter / click.
  const sending = useRef(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (fieldRef.current) fitHeight(fieldRef.current)
  }, [draft])

  // Rewrapping on width change (rotation, sidebar) changes the needed height.
  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fitHeight(el)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const canSend = draft.trim() !== '' && relays.length > 0 && !isSending

  const send = async () => {
    const submitted = draft
    const content = submitted.trim()
    if (!content || relays.length === 0 || sending.current) return
    sending.current = true
    setIsSending(true)
    setError(null)
    try {
      await publish({
        event: {
          kind: 1311,
          content,
          tags: [['a', stream.address, ...relays.slice(0, 1)]],
          created_at: nowInSecs(),
        },
        relays,
        label: t('liveChat.publishLabel', 'Send chat message'),
      })
      // Keep anything typed while the message was in flight.
      setDraft(current => (current === submitted ? '' : current))
      fieldRef.current?.focus()
      onSent?.()
    } catch (err) {
      setError(
        t('liveChat.sendFailed', {
          defaultValue: 'Message not sent: {{error}}',
          error: err instanceof Error ? err.message : String(err),
        })
      )
    } finally {
      sending.current = false
      setIsSending(false)
    }
  }

  return (
    // Not a <form>: slotted settings buttons must never act as submit.
    <div
      className="shrink-0 border-t pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
      data-live-composer
    >
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {relays.length === 0 && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {t('liveChat.noRelays', 'No relays available to send chat.')}
        </p>
      )}
      <div className="space-y-2">
        <Textarea
          ref={fieldRef}
          rows={1}
          value={draft}
          aria-label={t('liveChat.messageLabel', 'Chat message')}
          placeholder={t('liveChat.placeholder', 'Send a message')}
          className="max-h-[min(10rem,25dvh)] min-h-11 resize-none overflow-y-auto focus-visible:ring-inset focus-visible:ring-offset-0"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            // Plain Enter is a newline; Ctrl/Cmd+Enter sends. Never mid-IME composition.
            if (
              event.key === 'Enter' &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          {settings}
          <Button
            size="icon"
            onClick={() => void send()}
            className="size-8 shrink-0"
            disabled={!canSend}
            aria-label={t('liveChat.send', 'Send chat')}
          >
            <SendHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
