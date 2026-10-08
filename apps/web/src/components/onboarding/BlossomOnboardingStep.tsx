import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ServerCard } from './ServerCard'
import { RECOMMENDED_BLOSSOM_SERVERS, deriveServerName } from '@/lib/blossom-servers'
import { Upload, RefreshCw, Plus } from 'lucide-react'

interface BlossomOnboardingStepProps {
  uploadServers: string[]
  mirrorServers: string[]
  onRemoveUploadServer: (url: string) => void
  onRemoveMirrorServer: (url: string) => void
  onComplete: () => void
  onOpenUploadPicker: () => void
  onOpenMirrorPicker: () => void
  allowEmpty?: boolean
}

export function BlossomOnboardingStep({
  uploadServers,
  mirrorServers,
  onRemoveUploadServer,
  onRemoveMirrorServer,
  onComplete,
  onOpenUploadPicker,
  onOpenMirrorPicker,
  allowEmpty = false,
}: BlossomOnboardingStepProps) {
  const { t } = useTranslation()

  const isValid = allowEmpty || uploadServers.length > 0

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
      <CardHeader>
        <CardTitle>{t('uploadOnboarding.title')}</CardTitle>
        <CardDescription>{t('uploadOnboarding.description')}</CardDescription>
      </CardHeader>

      <div className="space-y-6">
        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload Servers Column */}
          <div className="space-y-3">
            {/* Section Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                  {t('uploadOnboarding.uploadServers.title')}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('uploadOnboarding.uploadServers.description')}
              </p>
            </div>

            {/* Empty State or Server List */}
            {uploadServers.length === 0 ? (
              <div
                onClick={onOpenUploadPicker}
                className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('uploadOnboarding.uploadServers.emptyState')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {uploadServers.map(url => (
                  <ServerCard
                    key={url}
                    server={getServerInfo(url)}
                    onRemove={() => onRemoveUploadServer(url)}
                  />
                ))}
              </div>
            )}

            {/* Add Button */}
            {uploadServers.length > 0 && (
              <div className="flex justify-center">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={onOpenUploadPicker}
                  className="w-10 h-10"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Mirror Servers Column */}
          <div className="space-y-3">
            {/* Section Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                  {t('uploadOnboarding.mirrorServers.title')}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('uploadOnboarding.mirrorServers.description')}
              </p>
            </div>

            {/* Empty State or Server List */}
            {mirrorServers.length === 0 ? (
              <div
                onClick={onOpenMirrorPicker}
                className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('uploadOnboarding.mirrorServers.emptyState')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {mirrorServers.map(url => (
                  <ServerCard
                    key={url}
                    server={getServerInfo(url)}
                    onRemove={() => onRemoveMirrorServer(url)}
                  />
                ))}
              </div>
            )}

            {/* Add Button */}
            {mirrorServers.length > 0 && (
              <div className="flex justify-center">
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={onOpenMirrorPicker}
                  className="w-10 h-10"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Validation Error */}
        {!isValid && (
          <p className="text-sm text-destructive">{t('uploadOnboarding.uploadServers.required')}</p>
        )}

        {/* Continue Button */}
        <div className="flex justify-end pt-2">
          <Button onClick={onComplete} disabled={!isValid} className="min-w-32">
            {t('uploadOnboarding.continue')}
          </Button>
        </div>
      </div>
    </>
  )
}
