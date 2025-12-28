import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Save, Loader2, Plus, X } from 'lucide-react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useMyPreset, type PresetFormData } from '@/hooks/useMyPreset'
import { PubkeyListEditor } from '@/components/presets/PubkeyListEditor'
import { LoginArea } from '@/components/auth/LoginArea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

    if (value.includes(input)) {
      setError('Relay already in list')
      return
    }

    onChange([...value, input])
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

  // Form state
  const [formData, setFormData] = useState<PresetFormData>({
    name: '',
    description: '',
    defaultRelays: [],
    defaultBlossomProxy: '',
    defaultThumbResizeServer: '',
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
          defaultThumbResizeServer: preset.defaultThumbResizeServer || '',
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

        {/* Blossom Proxy */}
        <Card>
          <CardHeader>
            <CardTitle>Blossom Proxy</CardTitle>
            <CardDescription>Optional proxy server for media content</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={formData.defaultBlossomProxy}
              onChange={e => setFormData(d => ({ ...d, defaultBlossomProxy: e.target.value }))}
              placeholder="https://proxy.example.com"
            />
          </CardContent>
        </Card>

        {/* Thumbnail Resize Server */}
        <Card>
          <CardHeader>
            <CardTitle>Thumbnail Resize Server</CardTitle>
            <CardDescription>Optional server for resizing thumbnail images</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={formData.defaultThumbResizeServer}
              onChange={e => setFormData(d => ({ ...d, defaultThumbResizeServer: e.target.value }))}
              placeholder="https://imgproxy.nostu.be/"
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
