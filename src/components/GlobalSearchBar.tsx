import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X, User, Loader2 } from 'lucide-react'
import { useSearchProfiles } from '@/hooks/useSearchProfiles'
import { UserAvatar } from '@/components/UserAvatar'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { cn } from '@/lib/utils'

interface GlobalSearchBarProps {
  isMobileExpanded?: boolean
  onSearch?: () => void
}

export function GlobalSearchBar({ isMobileExpanded, onSearch }: GlobalSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Focus input on mount if expanded on mobile
  useEffect(() => {
    if (isMobileExpanded) {
      inputRef.current?.focus()
    }
  }, [isMobileExpanded])

  const { profiles, loading } = useSearchProfiles({
    query: searchQuery,
    limit: 5,
  })

  // Show dropdown when we have results or are loading
  const showDropdown = isOpen && searchQuery.trim().length >= 2

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
    if (searchQuery.trim()) {
      setIsOpen(false)
      onSearch?.()
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const handleProfileClick = (pubkey: string) => {
    setIsOpen(false)
    onSearch?.()
    setSearchQuery('')
    navigate(buildProfileUrlFromPubkey(pubkey))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          placeholder="Search videos and people..."
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

        {/* Dropdown */}
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
                  People
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
                {!loading && profiles.length === 0 && searchQuery.trim().length >= 2 && (
                  <div className="px-2 py-2 text-sm text-muted-foreground">No people found</div>
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
                Search videos for "<span className="font-medium">{searchQuery.trim()}</span>"
              </span>
            </button>
          </div>
        )}
      </div>
    </form>
  )
}
