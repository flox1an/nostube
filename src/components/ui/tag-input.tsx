import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTagIndex, type TagIndexEntry } from '@/hooks'

interface TagInputProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  id?: string
  className?: string
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
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { searchTags } = useTagIndex()

  // Get suggestions based on current input
  const suggestions = React.useMemo(() => {
    if (!inputValue.trim()) return []
    const results = searchTags(inputValue, 8)
    // Filter out tags that are already added
    return results.filter(entry => !tags.includes(entry.tag))
  }, [inputValue, searchTags, tags])

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
      const normalized = normalizeTag(tag)
      if (normalized && !tags.includes(normalized)) {
        onTagsChange([...tags, normalized])
      }
      setInputValue('')
      setIsOpen(false)
    },
    [tags, onTagsChange]
  )

  const addTagsFromInput = useCallback(
    (input: string) => {
      const newTags = parseTagsFromInput(input)
      const uniqueNew = [...new Set(newTags)].filter(t => !tags.includes(t))
      if (uniqueNew.length > 0) {
        onTagsChange([...tags, ...uniqueNew])
      }
      setInputValue('')
      setIsOpen(false)
    },
    [tags, onTagsChange]
  )

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onTagsChange(tags.filter(t => t !== tagToRemove))
    },
    [tags, onTagsChange]
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
            />
          </div>
        </PopoverTrigger>
        {suggestions.length > 0 && (
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-1"
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
  entry: TagIndexEntry
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
