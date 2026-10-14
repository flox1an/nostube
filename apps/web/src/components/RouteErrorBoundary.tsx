import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import { EmptyState } from './EmptyState'

interface RouteErrorBoundaryProps {
  /** Clears the error when it changes (the current path). */
  resetKey: string
  children: ReactNode
}

/**
 * Keeps the layout up when a page fails to render, e.g. a route chunk that was never
 * cached and can't be fetched offline, instead of blanking the whole app.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    // Still let main.tsx see it: a stale chunk after a deploy triggers its reload.
    reportError(error)
  }

  componentDidUpdate(prev: RouteErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    return this.state.error ? <RouteErrorFallback /> : this.props.children
  }
}

function RouteErrorFallback() {
  const { t } = useTranslation()
  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <EmptyState title={t('errors.connectionError')} description={t('errors.pageLoadFailed')}>
        <Button onClick={() => window.location.reload()}>{t('errors.tryAgain')}</Button>
      </EmptyState>
    </div>
  )
}
