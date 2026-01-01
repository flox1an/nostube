import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { usePresets } from '@/hooks/usePresets'
import { useSelectedPreset } from '@/hooks/useSelectedPreset'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { PresetCard } from '@/components/presets/PresetCard'
import { DEFAULT_PRESET_PUBKEY } from '@/types/preset'

export function PresetsPage() {
  const { t } = useTranslation()
  const { presets, isLoading } = usePresets()
  const { preset: selectedPreset, selectedPubkey, setSelectedPreset } = useSelectedPreset()
  const { user } = useCurrentUser()

  // Update document title
  useEffect(() => {
    document.title = `${t('settings.presets.pageTitle')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  const handleSelectPreset = (pubkey: string) => {
    setSelectedPreset(pubkey)
    toast.success(t('settings.presets.selected'))
  }

  // Merge selected preset with loaded presets (selected preset shows immediately from cache)
  const displayPresets = useMemo(() => {
    // If we have the selected preset cached but it's not in the loaded list yet, add it
    if (selectedPreset && !presets.find(p => p.pubkey === selectedPreset.pubkey)) {
      return [selectedPreset, ...presets]
    }
    return presets
  }, [presets, selectedPreset])

  // Sort presets: default first, user's second, then by date
  const sortedPresets = useMemo(() => {
    return [...displayPresets].sort((a, b) => {
      // Default preset first
      if (a.pubkey === DEFAULT_PRESET_PUBKEY) return -1
      if (b.pubkey === DEFAULT_PRESET_PUBKEY) return 1
      // User's preset second
      if (user && a.pubkey === user.pubkey) return -1
      if (user && b.pubkey === user.pubkey) return 1
      // Then by creation date
      return b.createdAt - a.createdAt
    })
  }, [displayPresets, user])

  // Show content if we have any presets (cached or loaded)
  const hasContent = sortedPresets.length > 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('settings.presets.description')}</p>

      {!hasContent && isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('settings.presets.loading')}</p>
        </div>
      ) : !hasContent ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('settings.presets.noPresets')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPresets.map(preset => (
            <PresetCard
              key={preset.pubkey}
              preset={preset}
              isSelected={preset.pubkey === selectedPubkey}
              onClick={() => handleSelectPreset(preset.pubkey)}
            />
          ))}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('settings.presets.loadingMore')}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 p-4 rounded-lg border bg-muted/50">
        <h2 className="font-medium mb-2">{t('settings.presets.whatArePresets')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.presets.explanation')}</p>
      </div>
    </div>
  )
}
