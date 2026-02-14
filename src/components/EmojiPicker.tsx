import { memo } from 'react'
import { Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { EMOJI_CATEGORIES } from '@/constants/emojis'

interface EmojiPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmojiSelect: (emoji: string) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const EmojiPicker = memo(function EmojiPicker({
  open,
  onOpenChange,
  onEmojiSelect,
  align = 'start',
  side = 'bottom',
}: EmojiPickerProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
        className="w-80 p-2 z-[100]"
        align={align}
        side={side}
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
                    onClick={() => onEmojiSelect(emoji)}
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
  )
})
