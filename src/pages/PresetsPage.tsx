import { useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { usePresets } from '@/hooks/usePresets'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PresetCard } from '@/components/presets/PresetCard'
import { DEFAULT_PRESET_PUBKEY } from '@/types/preset'

export function PresetsPage() {
  const { presets, isLoading } = usePresets()
  const { selectedPubkey, setSelectedPreset } = useSelectedPreset()
  const { user } = useCurrentUser()

  // Update document title
  useEffect(() => {
    document.title = 'Choose a Preset - nostube'
    return () => {
      document.title = 'nostube'
    }
  }, [])

  const handleSelectPreset = (pubkey: string) => {
    setSelectedPreset(pubkey)
    toast.success('Preset selected')
  }

  return (
    <div className="max-w-560 mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Choose a Preset</h1>
        <p className="text-muted-foreground">
          Select a configuration preset to use for relays and content filtering
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading presets...</p>
        </div>
      ) : presets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No presets found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Show default preset first if it exists */}
          {presets
            .sort((a, b) => {
              // Default preset first
              if (a.pubkey === DEFAULT_PRESET_PUBKEY) return -1
              if (b.pubkey === DEFAULT_PRESET_PUBKEY) return 1
              // User's preset second
              if (user && a.pubkey === user.pubkey) return -1
              if (user && b.pubkey === user.pubkey) return 1
              // Then by creation date
              return b.createdAt - a.createdAt
            })
            .map(preset => (
              <PresetCard
                key={preset.pubkey}
                preset={preset}
                isSelected={preset.pubkey === selectedPubkey}
                onClick={() => handleSelectPreset(preset.pubkey)}
              />
            ))}
        </div>
      )}

      <div className="mt-8 p-4 rounded-lg border bg-muted/50">
        <h2 className="font-medium mb-2">What are presets?</h2>
        <p className="text-sm text-muted-foreground">
          Presets are community-published configurations that include recommended relays, blocked
          users, and NSFW author lists. By selecting a preset, you adopt that configuration for your
          nostube experience. You can also create and share your own preset.
        </p>
      </div>
    </div>
  )
}
