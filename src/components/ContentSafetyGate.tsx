import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    return createPortal(
      <div className="fixed inset-0 z-[300] bg-background" aria-hidden="true" />,
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
