import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Trash2, Database, Loader2 } from 'lucide-react'
import { toast } from '@/hooks'

export function CacheSettingsSection() {
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [cacheSize, setCacheSize] = useState<string>('Calculating...')

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
    setCacheSize('Calculating...')
    const size = await estimateCacheSize()
    setCacheSize(size)
  }, [estimateCacheSize])

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

    // Store a flag in sessionStorage to trigger cache clear on page load
    sessionStorage.setItem('clearCacheOnLoad', 'true')

    toast({
      title: 'Clearing Cache',
      description: 'The app will reload and clear the cache...',
    })

    // Reload the page - this will close all DB connections
    // The cache clearing will happen in a beforeunload handler
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Cache Management
          </CardTitle>
          <CardDescription>
            Clear cached events and data to free up storage space. This will remove all locally
            stored Nostr events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Cache Size</p>
              <p className="text-sm text-muted-foreground">{cacheSize}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshCacheSize()}
              disabled={isClearing}
            >
              Refresh
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg border-destructive/50 bg-destructive/5">
            <div>
              <p className="font-medium text-destructive">Clear All Cache</p>
              <p className="text-sm text-muted-foreground">
                Remove all cached events and data. The app will reload.
              </p>
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
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Cache
                </>
              )}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">What gets cleared:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>All cached Nostr events</li>
              <li>Event metadata and profiles</li>
              <li>Timeline data</li>
              <li>Local database storage (IndexedDB)</li>
            </ul>
            <p className="mt-3">
              <strong>Note:</strong> The app will reload to close database connections before
              clearing. Your account settings, relay configuration, and app preferences will not be
              affected.
            </p>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all cached Nostr events and data from your browser. The
              app will reload to reinitialize the cache.
              <br />
              <br />
              This action cannot be undone, but events will be re-fetched from relays as needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearCache}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                'Clear Cache'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
