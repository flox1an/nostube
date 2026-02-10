import { useEffect, useState } from 'react'
import { useFollowSet } from '@/hooks/useFollowSet'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'nostube_onboarding_follow_import'

export function FollowImportDialog() {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const {
    hasFollowSet,
    hasKind3Contacts,
    importFromKind3,
    kind3PubkeyCount,
    importProgress,
    cancelImport,
  } = useFollowSet()
  const [isOpen, setIsOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  // Determine if we should show the dialog
  useEffect(() => {
    if (!user?.pubkey) return

    // Check if user has already completed onboarding
    const completed = localStorage.getItem(STORAGE_KEY)
    if (completed) return

    // Show dialog if user has kind 3 but no kind 10020 media follows
    if (!hasFollowSet && hasKind3Contacts) {
      setIsOpen(true)
    }
    // Note: We don't auto-skip for users without kind 3 contacts to avoid race condition
    // where localStorage gets set before kind 3 data loads from relays
  }, [user?.pubkey, hasFollowSet, hasKind3Contacts])

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const success = await importFromKind3()
      if (success) {
        setImportSuccess(true)
        localStorage.setItem(STORAGE_KEY, 'imported')
        // Auto-close after showing success
        setTimeout(() => {
          setIsOpen(false)
        }, 2000)
      }
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'skipped')
    setIsOpen(false)
  }

  const handleCancel = () => {
    cancelImport()
    setIsImporting(false)
  }

  const progressPercent =
    importProgress.total > 0 ? Math.round((importProgress.checked / importProgress.total) * 100) : 0

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" hideCloseButton>
        <DialogHeader>
          <DialogTitle>{t('onboarding.followImport.title')}</DialogTitle>
          <DialogDescription>{t('onboarding.followImport.description')}</DialogDescription>
        </DialogHeader>

        {importSuccess || importProgress.phase === 'done' ? (
          <div className="flex flex-col items-center justify-center py-6">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <p className="text-center font-medium">
              {importProgress.withVideos > 0
                ? t('onboarding.followImport.successWithCount', {
                    count: importProgress.withVideos,
                  })
                : t('onboarding.followImport.noVideosFound')}
            </p>
          </div>
        ) : isImporting ? (
          <div className="py-4 space-y-4">
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
            <Progress value={progressPercent} className="h-2" />
            {importProgress.withVideos > 0 && (
              <p className="text-sm text-center text-muted-foreground">
                {t('onboarding.followImport.foundWithVideos', { count: importProgress.withVideos })}
              </p>
            )}
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {kind3PubkeyCount > 0 && (
              <div className="py-4 text-center">
                <p className="text-lg font-medium">
                  {t('onboarding.followImport.count', { count: kind3PubkeyCount })}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('onboarding.followImport.onlyWithVideos')}
                </p>
              </div>
            )}

            <DialogFooter className="flex-row gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={isImporting}
                className="flex-1"
              >
                {t('onboarding.followImport.skip')}
              </Button>
              <Button onClick={handleImport} disabled={isImporting} className="flex-1">
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('onboarding.followImport.import')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
