import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter } from 'react-router-dom'
import type { SiteBoot } from './boot'
import { SiteHome } from './SiteHome'

type State =
  { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & SiteBoot)

export function App({ boot }: { boot: Promise<SiteBoot> }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    boot
      .then(ready => !cancelled && setState({ status: 'ready', ...ready }))
      .catch(
        error =>
          !cancelled && setState({ status: 'error', message: String(error.message ?? error) })
      )
    return () => {
      cancelled = true
    }
  }, [boot])

  if (state.status === 'loading') {
    return <p className="p-8 text-center text-neutral-500">{t('site.app.loading')}</p>
  }
  // The detail comes from the config server or its validation; it stays as it is.
  if (state.status === 'error') {
    return (
      <div role="alert" className="space-y-1 p-8 text-center">
        <p className="text-red-600">{t('site.app.loadFailed')}</p>
        <p className="text-sm text-neutral-500">{state.message}</p>
      </div>
    )
  }
  return (
    <BrowserRouter>
      <SiteHome client={state.client} config={state.config} accountManager={state.accountManager} />
    </BrowserRouter>
  )
}
