import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext, useCurrentUser, useFollowSet } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, CheckCircle2, X } from 'lucide-react'

// ─── Import Follows ──────────────────────────────────

function ImportFollowsSection() {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { hasKind3Contacts, kind3PubkeyCount, importFromKind3, importProgress, cancelImport } =
    useFollowSet()
  const [isImporting, setIsImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)

  if (!user || !hasKind3Contacts) return null

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-4 space-y-3">
        <h3 className="text-base font-semibold">{t('settings.general.importFollows')}</h3>

        {importDone && importProgress.phase === 'done' ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {importProgress.withVideos > 0
              ? t('onboarding.followImport.successWithCount', { count: importProgress.withVideos })
              : t('onboarding.followImport.noVideosFound')}
          </div>
        ) : isImporting ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {importProgress.phase === 'checking'
                  ? t('onboarding.followImport.checking')
                  : t('onboarding.followImport.importing')}
              </span>
              <span>
                {importProgress.checked}/{importProgress.total}
              </span>
            </div>
            <Progress
              value={
                importProgress.total > 0
                  ? Math.round((importProgress.checked / importProgress.total) * 100)
                  : 0
              }
              className="h-2"
            />
            {importProgress.withVideos > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('onboarding.followImport.foundWithVideos', { count: importProgress.withVideos })}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cancelImport()
                setIsImporting(false)
              }}
            >
              <X className="h-4 w-4 mr-1" />
              {t('common.cancel')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={async () => {
                setIsImporting(true)
                setImportDone(false)
                try {
                  await importFromKind3()
                  setImportDone(true)
                } finally {
                  setIsImporting(false)
                }
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              {t('settings.general.importFollowsButton', { count: kind3PubkeyCount })}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('settings.general.importFollowsDescription')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reported Events ─────────────────────────────────

function ReportedEventsSection() {
  const { t } = useTranslation()
  const { config, updateConfig } = useAppContext()
  const reportedEvents = config.reportedEventIds ?? []

  const handleUnreport = (eventId: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      reportedEventIds: (currentConfig.reportedEventIds ?? []).filter(id => id !== eventId),
    }))
  }

  const handleClearAll = () => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      reportedEventIds: [],
    }))
  }

  if (reportedEvents.length === 0) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="p-4 space-y-2">
          <h3 className="text-base font-semibold">
            {t('settings.data.reportedEvents', { defaultValue: 'Reported Content' })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.data.noReportedEvents', {
              defaultValue:
                'No content has been reported. When you report a video, it will appear here and be hidden from your feeds.',
            })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {t('settings.data.reportedEvents', { defaultValue: 'Reported Content' })}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('settings.data.reportedEventsDescription', {
            defaultValue:
              'Videos you have reported are hidden from your feeds. You can un-report them here.',
          })}
        </p>
        <ScrollArea className="w-full rounded-md border p-3 max-h-48">
          <ul className="space-y-1.5">
            {reportedEvents.map(eventId => (
              <li key={eventId} className="flex items-center justify-between gap-2 text-sm">
                <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[300px]">
                  {eventId}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => handleUnreport(eventId)}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t('common.remove', { defaultValue: 'Remove' })}
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
        {reportedEvents.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearAll}>
            {t('settings.data.clearAllReported', {
              defaultValue: 'Clear all reported content',
            })}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Main Section ────────────────────────────────────

export function DataSection() {
  return (
    <div className="space-y-6">
      <ImportFollowsSection />
      <ReportedEventsSection />
    </div>
  )
}
