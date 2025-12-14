import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Upload, Server, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface BlossomOnboardingProps {
  hasUploadServers: boolean
  hasMirrorServers: boolean
  onQuickSetup: () => void
}

export function BlossomOnboarding({
  hasUploadServers,
  hasMirrorServers: _hasMirrorServers,
  onQuickSetup,
}: BlossomOnboardingProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // If everything is set up, show compact status
  if (hasUploadServers) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
        <CardContent className="flex items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-green-900 dark:text-green-100">
                {t('upload.onboarding.readyToUpload')}
              </span>
              <span className="text-xs text-green-700 dark:text-green-300">
                {t('upload.onboarding.serversConfigured')}
              </span>
            </div>
          </div>
          <Button
            onClick={() => navigate('/settings')}
            variant="ghost"
            size="sm"
            className="text-green-700 hover:text-green-900 dark:text-green-300 dark:hover:text-green-100 h-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Show onboarding for new users
  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Server className="h-6 w-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">
              {t('upload.onboarding.setupRequired')}
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              {t('upload.onboarding.explanation')}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Quick setup option */}
        <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-100 dark:border-blue-900">
          <div className="flex items-start gap-3">
            <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('upload.onboarding.quickSetupTitle')}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {t('upload.onboarding.quickSetupDescription')}
              </p>
            </div>
          </div>
          <Button onClick={onQuickSetup} className="w-full mt-3" size="sm">
            {t('upload.onboarding.quickSetupButton')}
          </Button>
        </div>

        {/* Manual setup option */}
        <div className="flex items-center justify-center gap-2 text-xs text-blue-700 dark:text-blue-300">
          <span>{t('upload.onboarding.orConfigure')}</span>
          <Button
            onClick={() => navigate('/settings')}
            variant="link"
            size="sm"
            className="text-blue-700 dark:text-blue-300 h-auto p-0 font-medium underline"
          >
            {t('upload.onboarding.manualSetup')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
