import { useState, useCallback } from 'react'
import { nip19 } from 'nostr-tools'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/UserAvatar'
import { useProfile } from '@/hooks/useProfile'
import { cn } from '@/lib/utils'

interface PubkeyItemProps {
  pubkey: string
  onRemove: () => void
}

function PubkeyItem({ pubkey, onRemove }: PubkeyItemProps) {
  const profile = useProfile({ pubkey })

  const displayName = profile?.display_name || profile?.name || pubkey.slice(0, 8) + '...'
  const npub = nip19.npubEncode(pubkey)

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
      <UserAvatar
        picture={profile?.picture}
        pubkey={pubkey}
        name={displayName}
        className="h-6 w-6"
      />
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{displayName}</div>
        <div className="truncate text-xs text-muted-foreground">{npub.slice(0, 16)}...</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface PubkeyListEditorProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
}

/**
 * Editor component for a list of pubkeys
 * Supports npub and hex format input
 */
export function PubkeyListEditor({
  value,
  onChange,
  placeholder = 'Enter npub or hex pubkey',
  className,
}: PubkeyListEditorProps) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = useCallback(() => {
    const input = inputValue.trim()
    if (!input) return

    setError(null)

    let hexPubkey: string

    // Try to decode as npub
    if (input.startsWith('npub1')) {
      try {
        const decoded = nip19.decode(input)
        if (decoded.type === 'npub') {
          hexPubkey = decoded.data
        } else {
          setError('Invalid npub format')
          return
        }
      } catch {
        setError('Invalid npub format')
        return
      }
    } else if (input.startsWith('nprofile1')) {
      try {
        const decoded = nip19.decode(input)
        if (decoded.type === 'nprofile') {
          hexPubkey = decoded.data.pubkey
        } else {
          setError('Invalid nprofile format')
          return
        }
      } catch {
        setError('Invalid nprofile format')
        return
      }
    } else if (/^[0-9a-f]{64}$/i.test(input)) {
      // Valid hex pubkey
      hexPubkey = input.toLowerCase()
    } else {
      setError('Invalid pubkey format (use npub or 64-char hex)')
      return
    }

    // Check for duplicates
    if (value.includes(hexPubkey)) {
      setError('Pubkey already in list')
      return
    }

    onChange([...value, hexPubkey])
    setInputValue('')
  }, [inputValue, value, onChange])

  const handleRemove = useCallback(
    (pubkey: string) => {
      onChange(value.filter(p => p !== pubkey))
    },
    [value, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd]
  )

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <div className="space-y-1">
          {value.map(pubkey => (
            <PubkeyItem key={pubkey} pubkey={pubkey} onRemove={() => handleRemove(pubkey)} />
          ))}
        </div>
      )}

      {value.length === 0 && <p className="text-sm text-muted-foreground">No pubkeys added</p>}
    </div>
  )
}
