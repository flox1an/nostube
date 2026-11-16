import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SendHorizontal } from 'lucide-react'
import type { LiveStream } from '@nostube/core/live-stream'
import { composeChatMessage, findTrigger } from '@nostube/core/chat-compose'
import { Button } from '@nostube/widgets/components/button'
import { EmojiPicker } from '@nostube/widgets/components/EmojiPicker'
import { Popover, PopoverAnchor } from '@nostube/widgets/components/popover'
import { Textarea } from '@nostube/widgets/components/textarea'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { useChatEmotes } from '@/hooks/useChatEmotes'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { nowInSecs } from '@/lib/utils'
import { useChatSuggestions, type Suggestion } from '@/hooks/useChatSuggestions'
import { ChatSuggestionList } from './ChatSuggestions'

type ComposerProps = {
  stream: LiveStream
  relays: string[]
  onSent?: () => void
  /** Extra controls (chat settings) shown beside Send, or beside sign-in for guests. */
  settings?: ReactNode
  /** Recent chatters, newest first: the first `@` suggestions. */
  participants?: readonly string[]
  /** Muted and blocked accounts, never suggested. */
  hidden?: ReadonlySet<string>
}

const NO_ONE: ReadonlySet<string> = new Set()

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
    return (
      <SignedInComposer
        key={`${props.stream.address}:${user.pubkey}`}
        {...props}
        pubkey={user.pubkey}
      />
    )
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

function SignedInComposer({
  stream,
  relays,
  onSent,
  settings,
  participants = [],
  hidden = NO_ONE,
  pubkey,
}: ComposerProps & { pubkey: string }) {
  const { t } = useTranslation()
  const { publish } = useNostrPublish()
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous guard: state lags a fast double Ctrl+Enter / click.
  const sending = useRef(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const { channel, mine } = useChatEmotes(stream.hostPubkey, pubkey)
  // Picked people by the name written in the draft; kept so a resent or retyped name still links.
  const mentions = useRef(new Map<string, string>())
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Esc closes the suggestions for the trigger at this index until another one is typed.
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [selection, setSelection] = useState({ key: '', index: 0 })
  // Where to put the caret once a pick has re-rendered the field.
  const pendingCaret = useRef<number | null>(null)

  const typed = focused ? findTrigger(draft, caret) : null
  const trigger = typed && typed.start !== dismissed ? typed : null
  const suggestions = useChatSuggestions(trigger, {
    hostPubkey: stream.hostPubkey,
    selfPubkey: pubkey,
    participants,
    hidden,
    channel,
    mine,
  })
  const open = suggestions.length > 0
  const triggerKey = trigger ? `${trigger.kind}${trigger.start}:${trigger.query}` : ''
  const active =
    selection.key === triggerKey ? Math.min(selection.index, suggestions.length - 1) : 0

  useLayoutEffect(() => {
    const field = fieldRef.current
    if (field) fitHeight(field)
    if (field && pendingCaret.current !== null) {
      field.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  }, [draft])

  /** Replace `from`–`to` of the draft with `text` and put the caret after it. */
  const insert = (text: string, from: number, to: number) => {
    const position = from + text.length
    setDraft(current => current.slice(0, from) + text + current.slice(to))
    setCaret(position)
    pendingCaret.current = position
  }

  const pick = (item: Suggestion) => {
    if (!trigger) return
    if (item.type === 'person') mentions.current.set(item.name, item.pubkey)
    const text =
      item.type === 'person'
        ? `@${item.name} `
        : item.type === 'custom'
          ? `:${item.emoji.shortcode}: `
          : `${item.emoji.unicode} `
    insert(text, trigger.start, caret)
  }

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
    if (!submitted.trim() || relays.length === 0 || sending.current) return
    // Channel emotes win a shortcode both lists use.
    const emojis = new Map([...mine, ...channel].map(emoji => [emoji.shortcode, emoji]))
    const { content, tags } = composeChatMessage(
      submitted.trim(),
      Array.from(mentions.current, ([name, mentioned]) => ({ name, pubkey: mentioned })),
      emojis
    )
    sending.current = true
    setIsSending(true)
    setError(null)
    // Clear now; publish resolves only after relay attempts settle.
    setDraft('')
    setDismissed(null)
    fieldRef.current?.focus()
    try {
      await publish({
        event: {
          kind: 1311,
          content,
          tags: [['a', stream.address, ...relays.slice(0, 1)], ...tags],
          created_at: nowInSecs(),
        },
        relays,
        label: t('liveChat.publishLabel', 'Send chat message'),
      })
      onSent?.()
    } catch (err) {
      // Restore the failed message unless something new was typed meanwhile.
      setDraft(current => (current === '' ? submitted : current))
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
        <Popover open={open}>
          <PopoverAnchor asChild>
            <div className="relative">
              {open && (
                <ChatSuggestionList id={listId} items={suggestions} active={active} onPick={pick} />
              )}
              <Textarea
                ref={fieldRef}
                rows={1}
                value={draft}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open ? `${listId}-${active}` : undefined}
                aria-label={t('liveChat.messageLabel', 'Chat message')}
                placeholder={t('liveChat.placeholder', 'Send a message')}
                className="max-h-[min(10rem,25dvh)] min-h-11 resize-none overflow-y-auto py-[11px] pr-11 focus-visible:ring-inset focus-visible:ring-offset-0"
                onChange={event => {
                  setDraft(event.target.value)
                  setCaret(event.target.selectionStart)
                }}
                onSelect={event => setCaret(event.currentTarget.selectionStart)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={event => {
                  if (event.nativeEvent.isComposing) return
                  const modified = event.ctrlKey || event.metaKey
                  if (open && !modified) {
                    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
                    if (step) {
                      event.preventDefault()
                      const index = (active + step + suggestions.length) % suggestions.length
                      setSelection({ key: triggerKey, index })
                      return
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      event.preventDefault()
                      pick(suggestions[active])
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setDismissed(trigger!.start)
                      return
                    }
                  }
                  // Plain Enter is a newline; Ctrl/Cmd+Enter sends.
                  if (event.key === 'Enter' && modified) {
                    event.preventDefault()
                    void send()
                  }
                }}
              />
              <EmojiPicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                side="top"
                align="end"
                triggerClassName="absolute right-1.5 bottom-1.5 text-muted-foreground hover:text-foreground"
                customSections={[
                  { label: t('liveChat.emotes.channel', 'Channel'), emojis: channel },
                  { label: t('liveChat.emotes.mine', 'Yours'), emojis: mine },
                ].filter(section => section.emojis.length > 0)}
                onEmojiSelect={emoji => insert(emoji, caret, caret)}
                onCustomSelect={emoji => insert(`:${emoji.shortcode}:`, caret, caret)}
              />
            </div>
          </PopoverAnchor>
        </Popover>
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
