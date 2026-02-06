import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { UserAvatar } from '@/components/UserAvatar'
import { useSearchProfiles, type ProfileResult } from '@/hooks/useSearchProfiles'
import { nip19 } from 'nostr-tools'
import { useEventStore } from 'applesauce-react/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { kinds } from 'nostr-tools'
import { getProfileContent } from 'applesauce-core/helpers'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { DEFAULT_RELAYS } from '@/nostr/core'
import { METADATA_RELAY } from '@/constants/relays'

export interface SelectedPerson {
  pubkey: string
  name: string
  picture?: string
  relays?: string[]
}

interface PeoplePickerProps {
  people: SelectedPerson[]
  onPeopleChange: (people: SelectedPerson[]) => void
  placeholder?: string
  id?: string
  className?: string
}

export function PeoplePicker({
  people,
  onPeopleChange,
  placeholder = 'Search people...',
  id,
  className,
}: PeoplePickerProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const eventStore = useEventStore()
  const { pool } = useAppContext()

  const { profiles, loading } = useSearchProfiles({
    query: inputValue,
    debounceMs: 300,
    limit: 8,
  })

  // Track which pubkeys we've already attempted to load to prevent duplicate loads
  const loadingPubkeysRef = useRef<Set<string>>(new Set())
  // Keep a ref to the latest people & callback to avoid stale closures in async callbacks
  const peopleRef = useRef(people)
  const onPeopleChangeRef = useRef(onPeopleChange)
  useEffect(() => {
    peopleRef.current = people
  }, [people])
  useEffect(() => {
    onPeopleChangeRef.current = onPeopleChange
  }, [onPeopleChange])

  // Auto-load missing profile data for programmatically added people
  useEffect(() => {
    const pubkeysToLoad: string[] = []

    for (const person of people) {
      // Skip if already loaded/loading
      if (loadingPubkeysRef.current.has(person.pubkey)) continue
      // Skip if profile data is already present
      if (person.picture && person.name !== person.pubkey.slice(0, 8)) continue

      // Check if profile exists in the event store already
      const existingEvent = eventStore.getReplaceable(kinds.Metadata, person.pubkey)
      if (existingEvent) {
        const profile = getProfileContent(existingEvent)
        if (profile && (profile.picture !== person.picture || profile.name !== person.name)) {
          loadingPubkeysRef.current.add(person.pubkey)
          // Defer the state update to avoid updating during render
          queueMicrotask(() => {
            const currentPeople = peopleRef.current
            onPeopleChangeRef.current(
              currentPeople.map(p =>
                p.pubkey === person.pubkey
                  ? {
                      ...p,
                      name: profile.name || profile.display_name || p.name,
                      picture: profile.picture || p.picture,
                    }
                  : p
              )
            )
          })
        }
      } else {
        pubkeysToLoad.push(person.pubkey)
      }
    }

    if (pubkeysToLoad.length === 0) return

    // Mark all as loading to prevent duplicate requests
    pubkeysToLoad.forEach(pk => loadingPubkeysRef.current.add(pk))

    // Use fallback relays (including metadata-specialized relay) when person has no relay hints
    const relays = [...DEFAULT_RELAYS, METADATA_RELAY]

    const loader = createTimelineLoader(
      pool,
      relays,
      {
        kinds: [kinds.Metadata],
        authors: pubkeysToLoad,
      },
      {
        eventStore,
        limit: pubkeysToLoad.length,
      }
    )

    const subscription = loader().subscribe({
      next: event => {
        const profile = getProfileContent(event)
        if (profile && event.pubkey) {
          const currentPeople = peopleRef.current
          onPeopleChangeRef.current(
            currentPeople.map(p =>
              p.pubkey === event.pubkey
                ? {
                    ...p,
                    name: profile.name || profile.display_name || p.name,
                    picture: profile.picture || p.picture,
                  }
                : p
            )
          )
        }
      },
      error: err => {
        console.error('[PeoplePicker] Error loading profiles:', err)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [people, eventStore, pool])

  // Filter out already selected people
  const filteredProfiles = React.useMemo(() => {
    const selectedPubkeys = new Set(people.map(p => p.pubkey))
    return profiles.filter(p => !selectedPubkeys.has(p.pubkey))
  }, [profiles, people])

  // Reset highlight when suggestions change
  useEffect(() => {
    queueMicrotask(() => setHighlightedIndex(0))
  }, [filteredProfiles])

  // Open dropdown when there are suggestions or loading
  useEffect(() => {
    queueMicrotask(() =>
      setIsOpen(filteredProfiles.length > 0 || (loading && inputValue.length >= 2))
    )
  }, [filteredProfiles, loading, inputValue])

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-person-item]')
      const highlightedItem = items[highlightedIndex]
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const addPerson = useCallback(
    (profile: ProfileResult) => {
      const person: SelectedPerson = {
        pubkey: profile.pubkey,
        name: profile.profile.name || profile.profile.display_name || profile.pubkey.slice(0, 8),
        picture: profile.profile.picture,
        // TODO: Extract relay hints from profile event if available
        relays: [],
      }
      onPeopleChange([...people, person])
      setInputValue('')
      setIsOpen(false)
    },
    [people, onPeopleChange]
  )

  const removePerson = useCallback(
    (pubkey: string) => {
      onPeopleChange(people.filter(p => p.pubkey !== pubkey))
    },
    [people, onPeopleChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (isOpen && filteredProfiles.length > 0) {
          addPerson(filteredProfiles[highlightedIndex])
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (isOpen && filteredProfiles.length > 0) {
          setHighlightedIndex(prev => (prev + 1) % filteredProfiles.length)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (isOpen && filteredProfiles.length > 0) {
          setHighlightedIndex(
            prev => (prev - 1 + filteredProfiles.length) % filteredProfiles.length
          )
        }
      } else if (e.key === 'Backspace' && !inputValue && people.length > 0) {
        // Remove last person when backspace on empty input
        removePerson(people[people.length - 1].pubkey)
      }
    },
    [isOpen, filteredProfiles, highlightedIndex, inputValue, people, addPerson, removePerson]
  )

  const handleBlur = useCallback(() => {
    // Small delay to allow click on suggestion to register
    setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }, [])

  const handleSuggestionClick = useCallback(
    (profile: ProfileResult) => {
      addPerson(profile)
      inputRef.current?.focus()
    },
    [addPerson]
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
              onBlur={handleBlur}
              placeholder={placeholder}
              autoComplete="off"
            />
            {loading && inputValue.length >= 2 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </PopoverTrigger>
        {(filteredProfiles.length > 0 || (loading && inputValue.length >= 2)) && (
          <PopoverContent
            className="z-[80] w-[var(--radix-popover-trigger-width)] p-1"
            align="start"
            sideOffset={4}
            onOpenAutoFocus={e => e.preventDefault()}
          >
            <div ref={listRef} className="max-h-64 overflow-y-auto">
              {loading && filteredProfiles.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Searching...
                </div>
              ) : (
                filteredProfiles.map((profile, index) => (
                  <PersonSuggestionItem
                    key={profile.pubkey}
                    profile={profile}
                    isHighlighted={index === highlightedIndex}
                    onClick={() => handleSuggestionClick(profile)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  />
                ))
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>

      {people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {people.map(person => (
            <SelectedPersonBadge key={person.pubkey} person={person} onRemove={removePerson} />
          ))}
        </div>
      )}
    </div>
  )
}

interface PersonSuggestionItemProps {
  profile: ProfileResult
  isHighlighted: boolean
  onClick: () => void
  onMouseEnter: () => void
}

function PersonSuggestionItem({
  profile,
  isHighlighted,
  onClick,
  onMouseEnter,
}: PersonSuggestionItemProps) {
  const displayName =
    profile.profile.name || profile.profile.display_name || profile.pubkey.slice(0, 8)
  const username = profile.profile.name
  const nip05 = profile.profile.nip05

  return (
    <div
      data-person-item
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2',
        isHighlighted && 'bg-accent text-accent-foreground'
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <UserAvatar
        picture={profile.profile.picture}
        pubkey={profile.pubkey}
        name={displayName}
        className="h-8 w-8 shrink-0"
      />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{displayName}</span>
        {nip05 ? (
          <span className="text-xs text-muted-foreground truncate">{nip05}</span>
        ) : username ? (
          <span className="text-xs text-muted-foreground truncate">@{username}</span>
        ) : (
          <span className="text-xs text-muted-foreground truncate">
            {nip19.npubEncode(profile.pubkey).slice(0, 16)}...
          </span>
        )}
      </div>
    </div>
  )
}

interface SelectedPersonBadgeProps {
  person: SelectedPerson
  onRemove: (pubkey: string) => void
}

function SelectedPersonBadge({ person, onRemove }: SelectedPersonBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-secondary px-2 py-1 text-sm">
      <UserAvatar
        picture={person.picture}
        pubkey={person.pubkey}
        name={person.name}
        className="h-5 w-5"
      />
      <span className="truncate max-w-32">{person.name}</span>
      <button
        type="button"
        onClick={() => onRemove(person.pubkey)}
        className="text-muted-foreground hover:text-foreground ml-1"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
