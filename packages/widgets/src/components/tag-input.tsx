import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../cn'
import { Input } from '@nostube/widgets/components/input'
import { Badge } from '@nostube/widgets/components/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@nostube/widgets/components/popover'

interface TagInputProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  id?: string
  className?: string
  search?: (query: string, limit?: number) => { tag: string; count: number }[]
  disabled?: boolean
}

/**
 * Normalize a tag: lowercase, trim, strip leading #
 */
function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#/, '')
}

/**
 * Parse input text into array of normalized, unique tags
 */
function parseTagsFromInput(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map(normalizeTag)
    .filter(t => t.length > 0)
}

export function TagInput({
  tags,
  onTagsChange,
  placeholder = 'Add tags...',
  id,
  className,
  search,
  disabled = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Get suggestions based on current input
  const suggestions = React.useMemo(() => {
    if (disabled || !search || !inputValue.trim()) return []
    const results = search(inputValue, 8)
    // Filter out tags that are already added
    return results.filter(entry => !tags.includes(entry.tag))
  }, [inputValue, search, tags, disabled])

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightedIndex(0)
  }, [suggestions])

  // Open dropdown when there are suggestions
  useEffect(() => {
    setIsOpen(suggestions.length > 0)
  }, [suggestions])

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-tag-item]')
      const highlightedItem = items[highlightedIndex]
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const addTag = useCallback(
    (tag: string) => {
      if (disabled) return
      const normalized = normalizeTag(tag)
      if (normalized && !tags.includes(normalized)) {
        onTagsChange([...tags, normalized])
      }
      setInputValue('')
      setIsOpen(false)
    },
    [tags, onTagsChange, disabled]
  )

  const addTagsFromInput = useCallback(
    (input: string) => {
      if (disabled) return
      const newTags = parseTagsFromInput(input)
      const uniqueNew = [...new Set(newTags)].filter(t => !tags.includes(t))
      if (uniqueNew.length > 0) {
        onTagsChange([...tags, ...uniqueNew])
      }
      setInputValue('')
      setIsOpen(false)
    },
    [tags, onTagsChange, disabled]
  )

  const removeTag = useCallback(
    (tagToRemove: string) => {
      if (disabled) return
      onTagsChange(tags.filter(t => t !== tagToRemove))
    },
    [tags, onTagsChange, disabled]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (isOpen && suggestions.length > 0) {
          // Select highlighted suggestion
          addTag(suggestions[highlightedIndex].tag)
        } else if (inputValue.trim()) {
          // Add typed text as tag(s)
          addTagsFromInput(inputValue)
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (isOpen && suggestions.length > 0) {
          setHighlightedIndex(prev => (prev + 1) % suggestions.length)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (isOpen && suggestions.length > 0) {
          setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
        }
      } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
        // Remove last tag when backspace on empty input
        removeTag(tags[tags.length - 1])
      }
    },
    [isOpen, suggestions, highlightedIndex, inputValue, tags, addTag, addTagsFromInput, removeTag]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text')
      if (pastedText.includes(' ') || pastedText.includes(',')) {
        e.preventDefault()
        // Combine current input with pasted text
        const combined = inputValue + ' ' + pastedText
        addTagsFromInput(combined)
      }
    },
    [inputValue, addTagsFromInput]
  )

  const handleBlur = useCallback(() => {
    // Small delay to allow click on suggestion to register
    setTimeout(() => {
      if (inputValue.trim()) {
        addTagsFromInput(inputValue)
      }
      setIsOpen(false)
    }, 150)
  }, [inputValue, addTagsFromInput])

  const handleSuggestionClick = useCallback(
    (tag: string) => {
      addTag(tag)
      inputRef.current?.focus()
    },
    [addTag]
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              id={id}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={handleBlur}
              placeholder={placeholder}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
        </PopoverTrigger>
        {suggestions.length > 0 && (
          <PopoverContent
            className="z-[80] w-[var(--radix-popover-trigger-width)] p-1"
            align="start"
            sideOffset={4}
            onOpenAutoFocus={e => e.preventDefault()}
          >
            <div ref={listRef} className="max-h-48 overflow-y-auto">
              {suggestions.map((entry, index) => (
                <SuggestionItem
                  key={entry.tag}
                  entry={entry}
                  isHighlighted={index === highlightedIndex}
                  onClick={() => handleSuggestionClick(entry.tag)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                />
              ))}
            </div>
          </PopoverContent>
        )}
      </Popover>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
              {tag}
              <button
                type="button"
                aria-label={`Remove #${tag}`}
                disabled={disabled}
                onClick={() => removeTag(tag)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

interface SuggestionItemProps {
  entry: { tag: string; count: number }
  isHighlighted: boolean
  onClick: () => void
  onMouseEnter: () => void
}

function SuggestionItem({ entry, isHighlighted, onClick, onMouseEnter }: SuggestionItemProps) {
  return (
    <div
      data-tag-item
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm',
        isHighlighted && 'bg-accent text-accent-foreground'
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span>{entry.tag}</span>
      <span className="text-xs text-muted-foreground">({entry.count})</span>
    </div>
  )
}
