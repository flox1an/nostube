import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export type ContentSafetyScreenState = 'hidden' | 'loading' | 'warning'

interface ContentSafetyGateProps {
  state: ContentSafetyScreenState
  onGoHome?: () => void
}

export function ContentSafetyGate({ state, onGoHome }: ContentSafetyGateProps) {
  const { t } = useTranslation()
  const goHomeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    const wasInert = root.inert
    root.inert = true
    return () => {
      root.inert = wasInert
    }
  }, [])

  useEffect(() => {
    const previousTitle = document.title
    document.title =
      state === 'warning' ? `${t('contentSafety.warning.title')} - nostube` : 'nostube'
    return () => {
      document.title = previousTitle
    }
  }, [state, t])

  useEffect(() => {
    if (state === 'warning') goHomeButtonRef.current?.focus()
  }, [state])

  if (state === 'hidden') {
    return createPortal(
      <div className="fixed inset-0 z-[300] bg-background" aria-hidden="true" />,
      document.body
    )
  }

  if (state === 'loading') {
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

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-background p-6 text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-safety-title"
      aria-describedby="content-safety-description"
    >
      <div className="max-w-md space-y-6">
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" aria-hidden="true" />
        <div className="space-y-2">
          <h1 id="content-safety-title" className="text-2xl font-semibold">
            {t('contentSafety.warning.title')}
          </h1>
          <p id="content-safety-description" className="text-muted-foreground">
            {t('contentSafety.warning.description')}
          </p>
        </div>
        <Button ref={goHomeButtonRef} onClick={onGoHome}>
          {t('contentSafety.warning.goHome')}
        </Button>
      </div>
    </div>,
    document.body
  )
}

interface ContentSafetyRouteProps {
  safetyGate: 'visible' | 'hidden' | 'warning'
  onGoHome: () => void
  children: ReactNode
}

export function ContentSafetyRoute({ safetyGate, onGoHome, children }: ContentSafetyRouteProps) {
  if (safetyGate === 'hidden') return <ContentSafetyGate state="hidden" />
  if (safetyGate === 'warning') {
    return <ContentSafetyGate state="warning" onGoHome={onGoHome} />
  }

  return children
}
