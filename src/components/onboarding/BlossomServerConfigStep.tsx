import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServerCard } from './ServerCard'
import {
  RECOMMENDED_BLOSSOM_SERVERS,
  DEFAULT_UPLOAD_SERVERS,
  DEFAULT_MIRROR_SERVERS,
  deriveServerName,
} from '@/lib/blossom-servers'
import type { BlossomServerTag } from '@/contexts/AppContext'

interface BlossomServerConfigStepProps {
  onComplete: () => void
}

export function BlossomServerConfigStep({ onComplete }: BlossomServerConfigStepProps) {
  const { t } = useTranslation()
  const { updateConfig } = useAppContext()
  const [selectedUploadServers, setSelectedUploadServers] =
    useState<string[]>(DEFAULT_UPLOAD_SERVERS)
  const [selectedMirrorServers, setSelectedMirrorServers] =
    useState<string[]>(DEFAULT_MIRROR_SERVERS)

  const handleToggleUploadServer = (url: string, checked: boolean) => {
    setSelectedUploadServers(prev => (checked ? [...prev, url] : prev.filter(s => s !== url)))
  }

  const handleToggleMirrorServer = (url: string, checked: boolean) => {
    setSelectedMirrorServers(prev => (checked ? [...prev, url] : prev.filter(s => s !== url)))
  }

  const handleContinue = () => {
    // Convert selections to BlossomServer format
    const blossomServers = [
      ...selectedUploadServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['initial upload'] as BlossomServerTag[],
      })),
      ...selectedMirrorServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['mirror'] as BlossomServerTag[],
      })),
    ]

    // Save to config
    updateConfig(current => ({
      ...current,
      blossomServers,
    }))

    // Mark onboarding complete
    localStorage.setItem('nostube_onboarding_blossom_config', 'completed')

    // Close dialog
    onComplete()
  }

  const isValid = selectedUploadServers.length > 0

  return (
    <div className="space-y-6">
      {/* Upload Servers Section */}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">{t('onboarding.blossom.uploadSection.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('onboarding.blossom.uploadSection.description')}
          </p>
        </div>

        <ScrollArea className="h-64 rounded-md border p-3">
          <div className="space-y-2">
            {RECOMMENDED_BLOSSOM_SERVERS.map(server => (
              <ServerCard
                key={server.url}
                server={server}
                checked={selectedUploadServers.includes(server.url)}
                onCheckedChange={checked => handleToggleUploadServer(server.url, checked)}
              />
            ))}
          </div>
        </ScrollArea>

        {!isValid && (
          <p className="text-sm text-destructive">
            {t('onboarding.blossom.uploadSection.required')}
          </p>
        )}
      </div>

      {/* Mirror Servers Section */}
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">{t('onboarding.blossom.mirrorSection.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('onboarding.blossom.mirrorSection.description')}
          </p>
        </div>

        <ScrollArea className="h-48 rounded-md border p-3">
          <div className="space-y-2">
            {RECOMMENDED_BLOSSOM_SERVERS.map(server => (
              <ServerCard
                key={server.url}
                server={server}
                checked={selectedMirrorServers.includes(server.url)}
                onCheckedChange={checked => handleToggleMirrorServer(server.url, checked)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleContinue} disabled={!isValid} className="min-w-32">
          {t('onboarding.blossom.continue')}
        </Button>
      </div>
    </div>
  )
}
