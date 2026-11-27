import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEventStore } from 'applesauce-react/hooks'
import { createEventLoader } from 'applesauce-loaders/loaders'
import { firstValueFrom, timeout } from 'rxjs'
import { Loader2 } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import { EmptyState } from '@/components/EmptyState'
import { useAppContext } from '@/hooks/useAppContext'
import { useReadRelays } from '@/hooks/useReadRelays'
import NotFound from '@/pages/NotFound'
import { routeForKind, routeNostrUri, type NostrHandlerRoute } from '@/lib/nostr-handler'

const LOAD_TIMEOUT_MS = 10_000

/**
 * Opens a NIP-19 identifier on the page for its kind: `/<nip19>` (the NIP-89 handler URL)
 * or `/nostr-handler?uri=web+nostr:<nip19>` (the PWA protocol handler).
 */
export function NostrHandlerPage() {
  const { t } = useTranslation()
  const { nip19: pathIdentifier } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const readRelays = useReadRelays()
  const uri = pathIdentifier ?? searchParams.get('uri') ?? ''
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    let cancelled = false
    const go = (route: NostrHandlerRoute) => {
      if (cancelled) return
      if (route.type === 'navigate') void navigate(route.to, { replace: true })
      else if (route.type === 'external') window.location.replace(route.url)
      else setInvalid(true)
    }

    setInvalid(false)
    const route = routeNostrUri(uri)
    if (route.type !== 'load') {
      go(route)
      return
    }

    // No kind in the identifier: the event decides between video page and njump.me.
    const cached = eventStore.getEvent(route.pointer.id)
    const loaded = cached
      ? Promise.resolve(cached)
      : firstValueFrom(
          createEventLoader(pool, { eventStore, extraRelays: readRelays })(route.pointer).pipe(
            timeout(LOAD_TIMEOUT_MS)
          ),
          { defaultValue: undefined }
        ).catch(() => undefined)
    // Not found here: njump.me asks more relays.
    void loaded.then(event => go(routeForKind(route.identifier, event?.kind)))

    return () => {
      cancelled = true
    }
  }, [uri, navigate, eventStore, pool, readRelays])

  if (invalid) {
    // `/<anything>` that is no NIP-19 identifier is an ordinary unknown page.
    if (pathIdentifier !== undefined) return <NotFound />
    return (
      <EmptyState
        heading="h1"
        title={t('pages.nostrHandler.invalidTitle')}
        description={t('pages.nostrHandler.invalidDescription')}
      >
        <Button asChild>
          <Link to="/">{t('pages.notFound.returnHome')}</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 py-16 text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      {t('pages.nostrHandler.opening')}
    </div>
  )
}
