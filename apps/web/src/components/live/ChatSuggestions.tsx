import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomEmoji } from '@nostube/widgets/components/CustomEmoji'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { PopoverContent } from '@nostube/widgets/components/popover'
import type { Suggestion } from '@/hooks/useChatSuggestions'
import { cn } from '@/lib/utils'

/** The suggestions above the chat field (inside its `Popover`, anchored to the field). */
export function ChatSuggestionList({
  id,
  items,
  active,
  onPick,
}: {
  id: string
  items: Suggestion[]
  active: number
  onPick: (item: Suggestion) => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [id, active])

  return (
    // A popover anchored to the field: it flips and shrinks instead of being clipped by the
    // chat panel. The field keeps focus; Escape and outside clicks are the field's to handle.
    <PopoverContent
      side="top"
      align="start"
      sideOffset={8}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}
      onEscapeKeyDown={event => event.preventDefault()}
      onInteractOutside={event => event.preventDefault()}
      className="max-h-[min(18rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) overflow-y-auto p-1"
    >
      <ul id={id} role="listbox" aria-label={t('liveChat.suggestions', 'Suggestions')}>
        {items.map((item, index) => (
          <li
            key={
              item.type === 'person'
                ? item.pubkey
                : item.type === 'custom'
                  ? `:${item.emoji.shortcode}`
                  : item.emoji.unicode
            }
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            // Keep focus (and the caret) in the field.
            onMouseDown={event => event.preventDefault()}
            onClick={() => onPick(item)}
            className={cn(
              'flex min-h-9 cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm',
              index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            {item.type === 'person' ? (
              <>
                <UserAvatar
                  picture={item.picture}
                  pubkey={item.pubkey}
                  name={item.name}
                  className="size-6 shrink-0"
                />
                <span className="truncate font-medium">{item.name}</span>
                {item.nip05 && (
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {item.nip05.replace(/^_@/, '')}
                  </span>
                )}
              </>
            ) : item.type === 'custom' ? (
              <>
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <CustomEmoji
                    shortcode={item.emoji.shortcode}
                    url={item.emoji.url}
                    className="my-0 h-6 max-w-6"
                  />
                </span>
                <span className="truncate">:{item.emoji.shortcode}:</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {item.source === 'channel'
                    ? t('liveChat.emotes.channel', 'Channel')
                    : t('liveChat.emotes.mine', 'Yours')}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden className="w-6 shrink-0 text-center text-lg leading-none">
                  {item.emoji.unicode}
                </span>
                <span className="truncate">
                  {item.emoji.shortcodes[0] ? `:${item.emoji.shortcodes[0]}:` : item.emoji.label}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </PopoverContent>
  )
}
