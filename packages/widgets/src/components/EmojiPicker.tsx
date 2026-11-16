import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Smile } from 'lucide-react'
import type { CustomEmoji as CustomEmojiData } from '@nostube/core/chat-compose'
import {
  loadUnicodeEmojis,
  matchRank,
  searchUnicodeEmojis,
  type UnicodeEmoji,
} from '@nostube/core/emoji-search'
import { Button } from './button'
import { Input } from './input'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { CustomEmoji } from './CustomEmoji'
import { cn } from '../cn'

import { EMOJI_CATEGORIES } from '../constants/emojis'

/** Custom emoji (NIP-30) shown above the Unicode emoji under their own heading. */
export interface CustomEmojiSection {
  label: string
  emojis: CustomEmojiData[]
}

interface EmojiPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmojiSelect: (emoji: string) => void
  /** Required with `customSections`: a custom emoji was picked. */
  onCustomSelect?: (emoji: CustomEmojiData) => void
  customSections?: CustomEmojiSection[]
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  triggerClassName?: string
}

const cell =
  'flex size-8 items-center justify-center rounded text-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none'

export const EmojiPicker = memo(function EmojiPicker({
  open,
  onOpenChange,
  onEmojiSelect,
  onCustomSelect,
  customSections = [],
  align = 'start',
  side = 'bottom',
  triggerClassName,
}: EmojiPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [unicode, setUnicode] = useState<UnicodeEmoji[]>([])
  const searching = query.trim() !== ''

  // The named list is only needed to search; it loads as its own chunk the first time.
  useEffect(() => {
    if (searching && unicode.length === 0) loadUnicodeEmojis().then(setUnicode, () => {})
  }, [searching, unicode.length])

  const sections = customSections
    .map(section => ({
      ...section,
      emojis: searching
        ? section.emojis.filter(emoji => matchRank(query.trim(), [emoji.shortcode]) !== null)
        : section.emojis,
    }))
    .filter(section => section.emojis.length > 0)
  const unicodeHits = searching ? searchUnicodeEmojis(unicode, query.trim(), 80) : []
  const empty = searching && unicode.length > 0 && sections.length === 0 && unicodeHits.length === 0

  const renderUnicode = (emoji: string, label?: string) => (
    <button
      key={emoji}
      type="button"
      title={label}
      aria-label={label ?? emoji}
      onClick={() => onEmojiSelect(emoji)}
      className={cell}
    >
      {emoji}
    </button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (!next) setQuery('')
        onOpenChange(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 rounded-full p-0', triggerClassName)}
          aria-label={t('emojiPicker.add')}
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-80 p-2"
        align={align}
        side={side}
        sideOffset={8}
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <Input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('emojiPicker.search')}
          aria-label={t('emojiPicker.search')}
          className="mb-2 h-8"
        />
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {sections.map(section => (
            <section key={section.label} aria-label={section.label}>
              <h3 className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                {section.label}
              </h3>
              <div className="flex flex-wrap gap-1">
                {section.emojis.map(emoji => (
                  <button
                    key={emoji.shortcode}
                    type="button"
                    title={`:${emoji.shortcode}:`}
                    onClick={() => onCustomSelect?.(emoji)}
                    className={cell}
                  >
                    <CustomEmoji
                      shortcode={emoji.shortcode}
                      url={emoji.url}
                      className="my-0 h-6 max-w-7"
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
          {searching ? (
            unicodeHits.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {unicodeHits.map(emoji => renderUnicode(emoji.unicode, emoji.label))}
              </div>
            )
          ) : (
            <section aria-label={t('emojiPicker.emoji')}>
              {customSections.length > 0 && (
                <h3 className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                  {t('emojiPicker.emoji')}
                </h3>
              )}
              <div className="space-y-3">
                {EMOJI_CATEGORIES.map(category => (
                  <div key={category.name} className="flex flex-wrap gap-1">
                    {category.emojis.map(emoji => renderUnicode(emoji))}
                  </div>
                ))}
              </div>
            </section>
          )}
          {empty && (
            <p role="status" className="px-1 py-6 text-center text-sm text-muted-foreground">
              {t('emojiPicker.empty')}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
