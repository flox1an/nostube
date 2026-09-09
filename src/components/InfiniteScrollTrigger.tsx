import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface InfiniteScrollTriggerProps {
  triggerRef: (node?: Element | null) => void
  loading: boolean
  exhausted: boolean
  itemCount: number
  /** True when the most recent load-more attempt failed. Only rendered once items already exist;
   *  the zero-item case is owned by VideoGrid to avoid a duplicate empty/error message. */
  error?: boolean
  onRetry?: () => void
  loadingMessage?: string
  exhaustedMessage?: string
  errorMessage?: string
}

/**
 * Component that displays loading/exhausted/error states for infinite scroll pagination.
 * Should be placed at the bottom of the scrollable content.
 */
export function InfiniteScrollTrigger({
  triggerRef,
  loading,
  exhausted,
  itemCount,
  error = false,
  onRetry,
  loadingMessage = 'Loading more...',
  exhaustedMessage = 'No more items to load.',
  errorMessage,
}: InfiniteScrollTriggerProps) {
  const { t } = useTranslation()
  return (
    <div ref={triggerRef} className="w-full py-8 flex items-center justify-center">
      {loading && itemCount > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingMessage}
        </div>
      )}
      {!loading && error && itemCount > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{errorMessage ?? t('video.networkError')}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      )}
      {!loading && !error && exhausted && itemCount > 0 && (
        <div className="text-muted-foreground">{exhaustedMessage}</div>
      )}
    </div>
  )
}
