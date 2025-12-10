import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServerCard } from './ServerCard'
import { BlossomServerPicker } from './BlossomServerPicker'
import { RECOMMENDED_BLOSSOM_SERVERS, deriveServerName } from '@/lib/blossom-servers'
import type { BlossomServerTag } from '@/contexts/AppContext'

interface BlossomOnboardingStepProps {
  onComplete: () => void
}

export function BlossomOnboardingStep({ onComplete }: BlossomOnboardingStepProps) {
  const { t } = useTranslation()
  const { updateConfig } = useAppContext()

  const [uploadServers, setUploadServers] = useState<string[]>([])
  const [mirrorServers, setMirrorServers] = useState<string[]>([])
  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [showMirrorPicker, setShowMirrorPicker] = useState(false)

  const handleContinue = () => {
    // Save to config
    const blossomServers = [
      ...uploadServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['initial upload'] as BlossomServerTag[],
      })),
      ...mirrorServers.map(url => ({
        url,
        name: deriveServerName(url),
        tags: ['mirror'] as BlossomServerTag[],
      })),
    ]

    updateConfig(current => ({ ...current, blossomServers }))
    onComplete()
  }

  const isValid = uploadServers.length > 0

  // Helper to get server info for display
  const getServerInfo = (url: string) => {
    const found = RECOMMENDED_BLOSSOM_SERVERS.find(s => s.url === url)
    if (found) return found

    // Create a basic BlossomServerInfo for custom URLs
    return {
      url,
      name: deriveServerName(url),
      status: 'ok' as const,
      supportsMirror: true,
      payment: 'free' as const,
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('uploadOnboarding.title')}</CardTitle>
          <CardDescription>{t('uploadOnboarding.description')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Upload Servers Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">
                {t('uploadOnboarding.uploadServers.title')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('uploadOnboarding.uploadServers.description')}
              </p>
            </div>

            {uploadServers.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded p-4">
                {t('uploadOnboarding.uploadServers.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {uploadServers.map(url => (
                  <ServerCard
                    key={url}
                    server={getServerInfo(url)}
                    onRemove={() => setUploadServers(prev => prev.filter(s => s !== url))}
                  />
                ))}
              </div>
            )}

            <Button onClick={() => setShowUploadPicker(true)}>
              {t('uploadOnboarding.uploadServers.addServer')}
            </Button>
          </div>

          {/* Mirror Servers Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">
                {t('uploadOnboarding.mirrorServers.title')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('uploadOnboarding.mirrorServers.description')}
              </p>
            </div>

            {mirrorServers.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded p-4">
                {t('uploadOnboarding.mirrorServers.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {mirrorServers.map(url => (
                  <ServerCard
                    key={url}
                    server={getServerInfo(url)}
                    onRemove={() => setMirrorServers(prev => prev.filter(s => s !== url))}
                  />
                ))}
              </div>
            )}

            <Button onClick={() => setShowMirrorPicker(true)}>
              {t('uploadOnboarding.mirrorServers.addServer')}
            </Button>
          </div>

          {/* Validation Error */}
          {!isValid && (
            <p className="text-sm text-destructive">
              {t('uploadOnboarding.uploadServers.required')}
            </p>
          )}

          {/* Continue Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleContinue} disabled={!isValid} className="min-w-32">
              {t('uploadOnboarding.continue')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Picker Dialogs */}
      <BlossomServerPicker
        open={showUploadPicker}
        onOpenChange={setShowUploadPicker}
        excludeServers={uploadServers}
        onSelect={(url) => {
          setUploadServers(prev => [...prev, url])
          setShowUploadPicker(false)
        }}
        type="upload"
      />

      <BlossomServerPicker
        open={showMirrorPicker}
        onOpenChange={setShowMirrorPicker}
        excludeServers={mirrorServers}
        onSelect={(url) => {
          setMirrorServers(prev => [...prev, url])
          setShowMirrorPicker(false)
        }}
        type="mirror"
      />
    </>
  )
}
