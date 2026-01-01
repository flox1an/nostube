import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trash2, Loader2 } from 'lucide-react'

export function CacheSettingsSection() {
  const { t } = useTranslation()
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [cacheSize, setCacheSize] = useState<string>(t('settings.cache.calculating'))

  const estimateCacheSize = useCallback(async () => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        const usageInMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2)
        return `~${usageInMB} MB`
      }
    } catch (error) {
      console.error('Failed to estimate cache size:', error)
    }
    return 'Unknown'
  }, [])

  const refreshCacheSize = useCallback(async () => {
    setCacheSize(t('settings.cache.calculating'))
    const size = await estimateCacheSize()
    setCacheSize(size)
  }, [estimateCacheSize, t])

  // Initial cache size calculation
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const size = await estimateCacheSize()
      if (!cancelled) {
        setCacheSize(size)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [estimateCacheSize])

  const handleClearCache = async () => {
    setIsClearing(true)
    setShowClearDialog(false)

    try {
      // Delete the nostr-idb IndexedDB database
      await new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase('nostr-idb')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error('Failed to delete database'))
        request.onblocked = () => {
          // Database is blocked, but we'll reload anyway
          resolve()
        }
      })
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }

    // Reload the page
    window.location.reload()
  }

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('settings.cache.description')}</p>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium">{t('settings.cache.cacheSize')}</p>
            <p className="text-sm text-muted-foreground">{cacheSize}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshCacheSize()}
            disabled={isClearing}
          >
            {t('common.refresh')}
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg border-destructive/50 bg-destructive/5">
          <div>
            <p className="font-medium text-destructive">{t('settings.cache.clearButton')}</p>
            <p className="text-sm text-muted-foreground">{t('settings.cache.clearDescription')}</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowClearDialog(true)}
            disabled={isClearing}
          >
            {isClearing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('settings.cache.clearing')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('settings.cache.clearButton')}
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">{t('settings.cache.whatGetsCleared')}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t('settings.cache.item1')}</li>
            <li>{t('settings.cache.item2')}</li>
            <li>{t('settings.cache.item3')}</li>
            <li>{t('settings.cache.item4')}</li>
          </ul>
          <p className="mt-3">{t('settings.cache.note')}</p>
        </div>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.cache.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.cache.confirmMessage')}
              <br />
              <br />
              {t('settings.cache.confirmWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('settings.cache.clearing')}
                </>
              ) : (
                t('settings.cache.clearButton')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
