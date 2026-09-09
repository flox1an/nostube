import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Save, Loader2, Plus, X } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMyPreset, type PresetFormData } from '@/hooks/useMyPreset'
import { usePresetBuffer } from '@/hooks/usePresetBuffer'
import { useProfile } from '@/hooks/useProfile'
import { type PresetBufferList, type PresetModerationEntry } from '@/types/preset'
import { PubkeyListEditor } from '@/components/presets/PubkeyListEditor'
import { LoginArea } from '@/components/auth/LoginArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { normalizeRelayUrl } from '@/lib/utils'

function RelayListEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = useCallback(() => {
    const input = inputValue.trim()
    if (!input) return

    setError(null)

    // Validate URL format
    if (!input.startsWith('wss://') && !input.startsWith('ws://')) {
      setError('Relay URL must start with wss:// or ws://')
      return
    }

    try {
      new URL(input)
    } catch {
      setError('Invalid URL format')
      return
    }

    const normalized = normalizeRelayUrl(input)

    if (value.includes(normalized)) {
      setError('Relay already in list')
      return
    }

    onChange([...value, normalized])
    setInputValue('')
  }, [inputValue, value, onChange])

  const handleRemove = useCallback(
    (url: string) => {
      onChange(value.filter(r => r !== url))
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="wss://relay.example.com"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <div className="space-y-1">
          {value.map(url => (
            <div
              key={url}
              className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm"
            >
              <span className="flex-1 truncate">{url}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleRemove(url)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && <p className="text-sm text-muted-foreground">No relays added</p>}
    </div>
  )
}

function EventIdListEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleAdd = useCallback(() => {
    const input = inputValue.trim()
    if (!input) return

    setError(null)

    // Validate hex event ID format (64 chars)
    if (!/^[0-9a-f]{64}$/i.test(input)) {
      setError('Event ID must be 64-character hex string')
      return
    }

    const normalized = input.toLowerCase()

    if (value.includes(normalized)) {
      setError('Event already in list')
      return
    }

    onChange([...value, normalized])
    setInputValue('')
  }, [inputValue, value, onChange])

  const handleRemove = useCallback(
    (id: string) => {
      onChange(value.filter(e => e !== id))
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="64-character hex event ID"
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 && (
        <div className="space-y-1">
          {value.map(id => (
            <div
              key={id}
              className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm font-mono"
            >
              <span className="flex-1 truncate">
                {id.slice(0, 16)}...{id.slice(-8)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleRemove(id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && <p className="text-sm text-muted-foreground">No events blocked</p>}
    </div>
  )
}

export function AdminPage() {
  const { user } = useCurrentUser()
  const { preset, isLoading, isPublishing, savePreset, hasPreset } = useMyPreset()
  const { removeEntries: removeBufferEntries } = usePresetBuffer()

  // Form state
  const [formData, setFormData] = useState<PresetFormData>({
    name: '',
    description: '',
    defaultRelays: [],
    defaultBlossomProxy: '',
    blockedPubkeys: [],
    nsfwPubkeys: [],
    blockedEvents: [],
  })

  // Initialize form with preset data when loaded
  useEffect(() => {
    if (preset) {
      queueMicrotask(() =>
        setFormData({
          name: preset.name,
          description: preset.description || '',
          defaultRelays: preset.defaultRelays,
          defaultBlossomProxy: preset.defaultBlossomProxy || '',
          blockedPubkeys: preset.blockedPubkeys,
          nsfwPubkeys: preset.nsfwPubkeys,
          blockedEvents: preset.blockedEvents,
        })
      )
    }
  }, [preset])

  // Update document title
  useEffect(() => {
    document.title = 'Admin - Manage Preset - nostube'
    return () => {
      document.title = 'nostube'
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Preset name is required')
      return
    }

    try {
      await savePreset(formData)
      toast.success('Preset saved successfully')
    } catch (error) {
      console.error('Failed to save preset:', error)
      toast.error('Failed to save preset')
    }
  }

  // Move staged buffer entries into the form lists; publishing happens on Save.
  const applyBuffer = (applied: PresetModerationEntry[]) => {
    setFormData(d => {
      const next = { ...d }
      for (const entry of applied) {
        if (!next[entry.list].includes(entry.value)) {
          next[entry.list] = [...next[entry.list], entry.value]
        }
      }
      return next
    })
    removeBufferEntries(applied.map(entry => entry.value))
    toast.success('Entries moved into the lists — review and save to publish')
  }

  // Show login prompt if not logged in
  if (!user) {
    return (
      <div className="max-w-560 mx-auto p-4">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Admin - Manage Preset</h1>
          <p className="text-muted-foreground mb-6">Please log in to manage your preset</p>
          <LoginArea />
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-560 mx-auto p-4">
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading preset...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Manage Your Preset</h1>
        <p className="text-muted-foreground">
          {hasPreset
            ? 'Edit your public preset configuration'
            : 'Create a new preset that others can use'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <PresetBufferPanel onApply={applyBuffer} />

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
            <CardDescription>Name and description for your preset</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(d => ({ ...d, name: e.target.value }))}
                placeholder="My Preset"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                placeholder="A brief description of this preset..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Default Relays */}
        <Card>
          <CardHeader>
            <CardTitle>Default Relays</CardTitle>
            <CardDescription>Relays that users should connect to</CardDescription>
          </CardHeader>
          <CardContent>
            <RelayListEditor
              value={formData.defaultRelays}
              onChange={relays => setFormData(d => ({ ...d, defaultRelays: relays }))}
            />
          </CardContent>
        </Card>

        {/* Media Cache Server */}
        <Card>
          <CardHeader>
            <CardTitle>Media Cache Server</CardTitle>
            <CardDescription>
              Optional server used for caching and proxying video content (Blossom Proxy)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={formData.defaultBlossomProxy}
              onChange={e => setFormData(d => ({ ...d, defaultBlossomProxy: e.target.value }))}
              onBlur={e =>
                setFormData(d => ({
                  ...d,
                  defaultBlossomProxy: e.target.value.trim().replace(/\/+$/, ''),
                }))
              }
              placeholder="https://proxy.example.com"
            />
          </CardContent>
        </Card>

        {/* Blocked Pubkeys */}
        <Card>
          <CardHeader>
            <CardTitle>Blocked Users</CardTitle>
            <CardDescription>
              Pubkeys of users whose content should be hidden entirely
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PubkeyListEditor
              value={formData.blockedPubkeys}
              onChange={pubkeys => setFormData(d => ({ ...d, blockedPubkeys: pubkeys }))}
            />
          </CardContent>
        </Card>

        {/* NSFW Pubkeys */}
        <Card>
          <CardHeader>
            <CardTitle>NSFW Authors</CardTitle>
            <CardDescription>
              Pubkeys of users whose content should be marked as NSFW
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PubkeyListEditor
              value={formData.nsfwPubkeys}
              onChange={pubkeys => setFormData(d => ({ ...d, nsfwPubkeys: pubkeys }))}
            />
          </CardContent>
        </Card>

        {/* Blocked Events */}
        <Card>
          <CardHeader>
            <CardTitle>Blocked Events</CardTitle>
            <CardDescription>Specific event IDs to hide</CardDescription>
          </CardHeader>
          <CardContent>
            <EventIdListEditor
              value={formData.blockedEvents}
              onChange={events => setFormData(d => ({ ...d, blockedEvents: events }))}
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={isPublishing}>
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Preset
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Name for a buffered pubkey, falling back to a short hex prefix. */
function PresetBufferPubkeyName({ pubkey }: { pubkey: string }) {
  const profile = useProfile({ pubkey })
  return <>{profile?.display_name || profile?.name || pubkey.slice(0, 8) + '...'}</>
}

const BUFFER_LIST_LABELS: Record<PresetBufferList, string> = {
  nsfwPubkeys: 'NSFW author',
  blockedPubkeys: 'Blocked user',
  blockedEvents: 'Blocked event',
}

/**
 * Staged moderation entries collected from video card menus. "Apply to lists"
 * merges them into the editors below; the preset event is published once, on Save.
 */
function PresetBufferPanel({ onApply }: { onApply: (entries: PresetModerationEntry[]) => void }) {
  const { entries, addEntry, removeEntries } = usePresetBuffer()
  if (entries.length === 0) return null

  const sorted = [...entries].sort((a, b) => b.addedAt - a.addedAt)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Moderation Buffer ({entries.length})</CardTitle>
        <CardDescription>
          Collected from video card menus. Apply moves them into the lists below — nothing is
          published until you save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map(entry => (
          <div
            key={entry.value}
            className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {entry.list === 'blockedEvents' ? (
                  <span className="font-mono">{entry.value.slice(0, 16)}…</span>
                ) : (
                  <PresetBufferPubkeyName pubkey={entry.value} />
                )}
              </div>
              {entry.source && (
                <div className="truncate text-xs text-muted-foreground">via “{entry.source}”</div>
              )}
            </div>
            {entry.list === 'blockedEvents' ? (
              <span className="text-xs text-muted-foreground">
                {BUFFER_LIST_LABELS[entry.list]}
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  addEntry(
                    entry.value,
                    entry.list === 'nsfwPubkeys' ? 'blockedPubkeys' : 'nsfwPubkeys',
                    entry.source
                  )
                }
              >
                {BUFFER_LIST_LABELS[entry.list]}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove from buffer"
              onClick={() => removeEntries([entry.value])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex justify-end">
          <Button type="button" onClick={() => onApply(sorted)}>
            Apply to lists
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
