import { useEffect } from 'react'
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
  const { selectedPubkey, setSelectedPreset } = useSelectedPreset()
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

  return (
    <div className="max-w-560 mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('settings.presets.pageTitle')}</h1>
        <p className="text-muted-foreground">{t('settings.presets.description')}</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('settings.presets.loading')}</p>
        </div>
      ) : presets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('settings.presets.noPresets')}</p>
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
        <h2 className="font-medium mb-2">{t('settings.presets.whatArePresets')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.presets.explanation')}</p>
      </div>
    </div>
  )
}
