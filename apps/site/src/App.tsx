import { useEffect, useState } from 'react'
import type { SiteBoot } from './boot'
import { SiteHome } from './SiteHome'

type State =
  { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & SiteBoot)

export function App({ boot }: { boot: Promise<SiteBoot> }) {
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
    return <p className="p-8 text-center text-neutral-500">Loading…</p>
  }
  if (state.status === 'error') {
    return <p className="p-8 text-center text-red-600">{state.message}</p>
  }
  return <SiteHome client={state.client} config={state.config} />
}
