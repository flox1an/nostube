import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { EyeOff, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { ContentSafetyGate as ContentSafetyGateState } from '@/lib/content-safety'

export type ContentSafetyScreenState = 'hidden' | 'loading'

interface ContentSafetyGateProps {
  state: ContentSafetyScreenState
}

export function ContentSafetyGate({ state }: ContentSafetyGateProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    const wasInert = root.inert
    root.inert = true
    return () => {
      root.inert = wasInert
    }
  }, [])

  if (state === 'hidden') {
    // Deliberately generic: covers NSFW content hidden by the viewer's settings
    // and blocked accounts, without revealing anything about the content.
    return createPortal(
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-background p-6"
        role="alert"
      >
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <EyeOff className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{t('contentSafety.hidden.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('contentSafety.hidden.description')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/">{t('contentSafety.hidden.home')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings/content">{t('contentSafety.hidden.settings')}</Link>
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-background"
      role="status"
      aria-label={t('contentSafety.loading')}
    >
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>,
    document.body
  )
}

interface ContentSafetyRouteProps {
  safetyGate: ContentSafetyGateState
  children: ReactNode
}

export function ContentSafetyRoute({ safetyGate, children }: ContentSafetyRouteProps) {
  if (safetyGate === 'hidden') return <ContentSafetyGate state="hidden" />

  return children
}
