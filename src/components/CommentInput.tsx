import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Smile } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { imageProxy } from '@/lib/utils'

// Common emoji categories for quick access
const EMOJI_CATEGORIES = [
  {
    name: 'smileys',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😅',
      '😂',
      '🤣',
      '😊',
      '😇',
      '🙂',
      '😉',
      '😍',
      '🥰',
      '😘',
      '😋',
      '😛',
      '🤪',
      '😜',
      '🤨',
      '🧐',
      '🤓',
      '😎',
      '🥳',
      '😏',
      '😒',
      '😞',
      '😔',
      '😟',
      '😕',
      '🙁',
      '😣',
      '😖',
      '😫',
      '😩',
      '🥺',
      '😢',
      '😭',
      '😤',
      '😠',
      '😡',
    ],
  },
  {
    name: 'gestures',
    emojis: [
      '👍',
      '👎',
      '👏',
      '🙌',
      '👐',
      '🤲',
      '🤝',
      '🙏',
      '✌️',
      '🤞',
      '🤟',
      '🤘',
      '🤙',
      '👈',
      '👉',
      '👆',
      '👇',
      '☝️',
      '✋',
      '🤚',
      '🖐️',
      '🖖',
      '👋',
      '🤏',
      '✍️',
      '💪',
    ],
  },
  {
    name: 'hearts',
    emojis: [
      '❤️',
      '🧡',
      '💛',
      '💚',
      '💙',
      '💜',
      '🖤',
      '🤍',
      '🤎',
      '💔',
      '❤️‍🔥',
      '❤️‍🩹',
      '💕',
      '💞',
      '💓',
      '💗',
      '💖',
      '💘',
      '💝',
    ],
  },
  {
    name: 'reactions',
    emojis: [
      '🔥',
      '⭐',
      '✨',
      '💯',
      '💥',
      '💫',
      '🎉',
      '🎊',
      '🏆',
      '🥇',
      '🎯',
      '💡',
      '💪',
      '👀',
      '🤔',
      '💀',
      '☠️',
      '👻',
      '🤖',
      '👽',
    ],
  },
]

interface CommentInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  placeholder?: string
  submitLabel?: string
  userAvatar?: string
  userName?: string
  disabled?: boolean
  autoFocus?: boolean
}

export const CommentInput = React.memo(function CommentInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitLabel,
  userAvatar,
  userName,
  disabled,
  autoFocus,
}: CommentInputProps) {
  const { t } = useTranslation()
  const [isFocused, setIsFocused] = useState(autoFocus ?? false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayPlaceholder = placeholder ?? t('video.comments.addComment')
  const displaySubmitLabel = submitLabel ?? t('video.comments.commentButton')

  // Focus input when autoFocus is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const handleCancel = useCallback(() => {
    setIsFocused(false)
    setEmojiPickerOpen(false)
    onChange('')
    inputRef.current?.blur()
  }, [onChange])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!value.trim() || disabled) return
      onSubmit(e)
      setIsFocused(false)
      setEmojiPickerOpen(false)
    },
    [value, disabled, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSubmit(e)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    },
    [handleSubmit, handleCancel]
  )

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      const input = inputRef.current
      if (input) {
        const start = input.selectionStart ?? value.length
        const end = input.selectionEnd ?? value.length
        const newValue = value.slice(0, start) + emoji + value.slice(end)
        onChange(newValue)

        // Set cursor position after emoji
        requestAnimationFrame(() => {
          const newPos = start + emoji.length
          input.setSelectionRange(newPos, newPos)
          input.focus()
        })
      } else {
        onChange(value + emoji)
      }
    },
    [value, onChange]
  )

  // Handle clicks outside to unfocus (but not when emoji picker is open)
  useEffect(() => {
    if (!isFocused || emojiPickerOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Only unfocus if there's no content
        if (!value.trim()) {
          setIsFocused(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isFocused, emojiPickerOpen, value])

  return (
    <div ref={containerRef} className="w-full">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3 items-start">
          {/* Avatar - small when collapsed, larger when expanded */}
          <Avatar
            className={`shrink-0 transition-all duration-200 ${isFocused ? 'h-10 w-10' : 'h-6 w-6'}`}
          >
            <AvatarImage src={imageProxy(userAvatar)} />
            <AvatarFallback className="text-xs">{userName?.[0] ?? '?'}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {/* Input field */}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              onFocus={handleFocus}
              onKeyDown={handleKeyDown}
              placeholder={displayPlaceholder}
              className="w-full bg-transparent border-0 border-b border-muted-foreground/30 focus:border-foreground px-0 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground"
              disabled={disabled}
            />

            {/* Controls - shown only when focused */}
            {isFocused && (
              <div className="flex items-center justify-between mt-2">
                {/* Emoji picker */}
                <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full"
                      aria-label="Add emoji"
                    >
                      <Smile className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-2"
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    onOpenAutoFocus={e => e.preventDefault()}
                  >
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {EMOJI_CATEGORIES.map(category => (
                        <div key={category.name}>
                          <div className="flex flex-wrap gap-1">
                            {category.emojis.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleEmojiSelect(emoji)}
                                className="h-8 w-8 flex items-center justify-center text-lg hover:bg-muted rounded transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" size="sm" disabled={!value.trim() || disabled}>
                    {displaySubmitLabel}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  )
})
