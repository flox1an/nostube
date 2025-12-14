import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServerCard } from './ServerCard'
import { BlossomServerPicker } from './BlossomServerPicker'
import { RECOMMENDED_BLOSSOM_SERVERS, deriveServerName } from '@/lib/blossom-servers'
import type { BlossomServerTag } from '@/contexts/AppContext'
import { Upload, RefreshCw, Plus } from 'lucide-react'

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
          {/* Two-column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upload Servers Column */}
            <div className="space-y-3">
              {/* Section Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">{t('uploadOnboarding.uploadServers.title')}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('uploadOnboarding.uploadServers.description')}
                </p>
              </div>

              {/* Empty State or Server List */}
              {uploadServers.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('uploadOnboarding.uploadServers.emptyState')}</p>
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

              {/* Add Button */}
              <Button
                size="icon"
                variant="outline"
                onClick={() => setShowUploadPicker(true)}
                className="w-10 h-10"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Mirror Servers Column */}
            <div className="space-y-3">
              {/* Section Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">{t('uploadOnboarding.mirrorServers.title')}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('uploadOnboarding.mirrorServers.description')}
                </p>
              </div>

              {/* Empty State or Server List */}
              {mirrorServers.length === 0 ? (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('uploadOnboarding.mirrorServers.emptyState')}</p>
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

              {/* Add Button */}
              <Button
                size="icon"
                variant="outline"
                onClick={() => setShowMirrorPicker(true)}
                className="w-10 h-10"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
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
        onSelect={url => {
          setUploadServers(prev => [...prev, url])
          setShowUploadPicker(false)
        }}
        type="upload"
      />

      <BlossomServerPicker
        open={showMirrorPicker}
        onOpenChange={setShowMirrorPicker}
        excludeServers={mirrorServers}
        onSelect={url => {
          setMirrorServers(prev => [...prev, url])
          setShowMirrorPicker(false)
        }}
        type="mirror"
      />
    </>
  )
}
