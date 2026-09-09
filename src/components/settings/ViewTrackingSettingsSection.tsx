import { useState } from 'react'
import { useAppContext } from '@/hooks'
import { normalizeRelayUrl } from '@/lib/utils'
import { DEFAULT_VIEW_TRACKING_RELAYS } from '@/constants/relays'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XIcon } from 'lucide-react'

/**
 * Advanced protocol detail: which relays view-sharing events (kind 22236) are
 * published to. The on/off preference itself lives under Settings → Privacy
 * and data (see ViewSharingSection in DataSection.tsx) — this section only
 * covers relay destinations, and stays reachable regardless of the toggle.
 */
export function ViewTrackingSettingsSection() {
  const { config, updateConfig } = useAppContext()
  const [newRelayUrl, setNewRelayUrl] = useState('')

  const relays: string[] =
    config.viewTrackingRelays && config.viewTrackingRelays.length > 0
      ? config.viewTrackingRelays
      : DEFAULT_VIEW_TRACKING_RELAYS

  const handleAddRelay = () => {
    const trimmed = newRelayUrl.trim()
    if (!trimmed) return
    const normalized = normalizeRelayUrl(trimmed)
    if (relays.includes(normalized)) {
      setNewRelayUrl('')
      return
    }
    updateConfig(c => ({ ...c, viewTrackingRelays: [...relays, normalized] }))
    setNewRelayUrl('')
  }

  const handleRemoveRelay = (url: string) => {
    updateConfig(c => ({
      ...c,
      viewTrackingRelays: relays.filter(r => r !== url),
    }))
  }

  const handleReset = () => {
    updateConfig(c => ({ ...c, viewTrackingRelays: [...DEFAULT_VIEW_TRACKING_RELAYS] }))
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">View-sharing relays</p>
        <p className="text-xs text-muted-foreground">
          Kind&nbsp;22236 view events are published to these relays when view sharing is enabled
          (Settings → Privacy and data). Your main relay list is not used.
        </p>
      </div>

      {relays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No relays configured.</p>
      ) : (
        <ScrollArea className="w-full rounded-md border p-3 max-h-40">
          <ul className="space-y-1.5">
            {relays.map(url => (
              <li key={url} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{url}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleRemoveRelay(url)}
                  aria-label={`Remove ${url}`}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="wss://relay.example.com"
          value={newRelayUrl}
          onChange={e => setNewRelayUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddRelay()
          }}
          className="flex-1"
        />
        <Button onClick={handleAddRelay} size="sm">
          Add
        </Button>
      </div>

      <Button variant="outline" size="sm" onClick={handleReset}>
        Reset to default
      </Button>
    </div>
  )
}
