import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X, User, Loader2, Clock } from 'lucide-react'
import { useSearchVideoAuthors } from '@/hooks/useSearchVideoAuthors'
import { UserAvatar } from '@/components/UserAvatar'
import { buildProfileUrlFromPubkey, buildProfilePath } from '@/lib/nprofile'
import { decodeProfilePointer } from '@/lib/nip19'
import { cn } from '@/lib/utils'
import { getSearchHistory, addSearchHistory, removeSearchHistory } from '@/lib/search-history'

interface GlobalSearchBarProps {
  isMobileExpanded?: boolean
  onSearch?: () => void
}

export function GlobalSearchBar({ isMobileExpanded, onSearch }: GlobalSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [history, setHistory] = useState<string[]>(() => getSearchHistory())
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Focus input on mount if expanded on mobile
  useEffect(() => {
    if (isMobileExpanded) {
      inputRef.current?.focus()
    }
  }, [isMobileExpanded])

  const { profiles, loading } = useSearchVideoAuthors({
    query: searchQuery,
    limit: 5,
  })

  const trimmedQuery = searchQuery.trim()
  // Live results: query present
  const showDropdown = isOpen && trimmedQuery.length >= 2
  // History: empty input, has entries
  const showHistory = isOpen && trimmedQuery.length === 0 && history.length > 0

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Focus search bar on '/' key
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !(document.activeElement as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const query = trimmedQuery
    if (!query) return

    setIsOpen(false)
    onSearch?.()

    // Check for npub/nprofile — navigate to profile page (not saved to history)
    if (query.startsWith('npub1') || query.startsWith('nprofile1')) {
      const profile = decodeProfilePointer(query)
      if (profile) {
        setSearchQuery('')
        navigate(buildProfilePath(query))
        return
      }
    }

    // Check for hashtag — navigate to tag page (not saved to history)
    if (query.startsWith('#') && query.length > 1) {
      const tag = query.slice(1).trim()
      if (tag) {
        setSearchQuery('')
        navigate(`/tag/${encodeURIComponent(tag)}`)
        return
      }
    }

    // Plain text video search — save to history
    setHistory(addSearchHistory(query))
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  const handleProfileClick = (pubkey: string) => {
    setIsOpen(false)
    onSearch?.()
    setSearchQuery('')
    navigate(buildProfileUrlFromPubkey(pubkey))
  }

  const handleHistoryClick = (query: string) => {
    setIsOpen(false)
    onSearch?.()
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  const handleHistoryDelete = (e: React.MouseEvent, query: string) => {
    e.stopPropagation()
    const updated = removeSearchHistory(query)
    setHistory(updated)
    setSelectedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showHistory) {
      const totalItems = history.length
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
          if (selectedIndex >= 0) {
            e.preventDefault()
            handleHistoryClick(history[selectedIndex])
          }
          break
        case 'Escape':
          setIsOpen(false)
          break
      }
      return
    }

    if (!showDropdown || profiles.length === 0) return

    // Total items = profiles + 1 (search videos option)
    const totalItems = profiles.length + 1

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % totalItems)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
        break
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < profiles.length) {
          e.preventDefault()
          handleProfileClick(profiles[selectedIndex].pubkey)
        }
        // If selectedIndex is -1 or last item (search videos), let form submit
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsOpen(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'flex gap-2 items-center justify-center w-full',
        !isMobileExpanded && 'hidden md:flex'
      )}
    >
      <div
        className={cn(
          'relative w-full',
          !isMobileExpanded && 'max-w-[20em] lg:max-w-[28em] lg:w-[28em]'
        )}
      >
        <Input
          ref={inputRef}
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value)
            setSelectedIndex(-1) // Reset selection on query change
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-10"
          placeholder="Search videos and creators..."
        />
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-6 w-6 p-0"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {/* History dropdown — shown when input is empty and focused */}
        {showHistory && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 overflow-hidden"
          >
            <div className="p-2">
              <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                <Clock className="h-3 w-3" />
                Recent searches
              </div>
              {history.map((query, index) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => handleHistoryClick(query)}
                  className={cn(
                    'group w-full flex items-center gap-3 px-2 py-2 rounded-sm text-left hover:bg-accent transition-colors',
                    selectedIndex === index && 'bg-accent'
                  )}
                >
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0 truncate text-sm">{query}</span>
                  <span
                    role="button"
                    aria-label={`Remove "${query}" from history`}
                    onClick={e => handleHistoryDelete(e, query)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background transition-opacity"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Live results dropdown — shown when query >= 2 chars */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 overflow-hidden"
          >
            {/* People section */}
            {(loading || profiles.length > 0) && (
              <div className="p-2">
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <User className="h-3 w-3" />
                  Creators
                  {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                {profiles.map((result, index) => (
                  <button
                    key={result.pubkey}
                    type="button"
                    onClick={() => handleProfileClick(result.pubkey)}
                    className={cn(
                      'w-full flex items-center gap-3 px-2 py-2 rounded-sm text-left hover:bg-accent transition-colors',
                      selectedIndex === index && 'bg-accent'
                    )}
                  >
                    <UserAvatar
                      picture={result.profile.picture}
                      pubkey={result.pubkey}
                      name={result.profile.name || result.profile.display_name}
                      className="h-8 w-8"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {result.profile.display_name || result.profile.name || 'Anonymous'}
                      </div>
                      {result.profile.nip05 && (
                        <div className="text-xs text-muted-foreground truncate">
                          {result.profile.nip05}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {!loading && profiles.length === 0 && trimmedQuery.length >= 2 && (
                  <div className="px-2 py-2 text-sm text-muted-foreground">No creators found</div>
                )}
              </div>
            )}

            {/* Divider */}
            {profiles.length > 0 && <div className="border-t" />}

            {/* Search videos option */}
            <button
              type="submit"
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors',
                selectedIndex === profiles.length && 'bg-accent'
              )}
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span>
                Search videos for "<span className="font-medium">{trimmedQuery}</span>"
              </span>
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
