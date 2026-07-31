import type { ISigner } from 'applesauce-signers'
import type { PublishResponse, RelayPool } from 'applesauce-relay'
import type { Observable } from 'rxjs'
import type { Event, EventTemplate } from 'nostr-tools'

import { normalizeRelayUrl, nowInSecs } from '@/lib/utils'

export const PRIVATE_RELAY_LIST_KIND = 10013

export type PrivateRelayStatus =
  'disconnected' | 'connected' | 'authenticating' | 'authenticated' | 'error'

interface PrivateRelayConnection {
  connected$: Observable<boolean>
  authenticatedAs$: Observable<string | null>
  challenge$: Observable<string | null>
  authenticatedAs: string | null
  authenticate(signer: ISigner): Promise<PublishResponse>
}

interface PrivateRelayConnectionPool {
  relay(url: string): PrivateRelayConnection
}

export function normalizePrivateRelayUrls(urls: readonly string[]): string[] {
  const normalized = urls.map(normalizeRelayUrl).filter(url => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'wss:' || parsed.protocol === 'ws:'
    } catch {
      return false
    }
  })

  return Array.from(new Set(normalized))
}

export async function createPrivateRelayListEvent(
  signer: ISigner,
  pubkey: string,
  relays: readonly string[]
): Promise<Event> {
  if (!signer.nip44) throw new Error('Signer does not support NIP-44 encryption')

  const privateTags = normalizePrivateRelayUrls(relays).map(url => ['relay', url])
  const content = await signer.nip44.encrypt(pubkey, JSON.stringify(privateTags))
  const template: EventTemplate = {
    kind: PRIVATE_RELAY_LIST_KIND,
    created_at: nowInSecs(),
    tags: [],
    content,
  }

  return signer.signEvent(template)
}

export async function decryptPrivateRelayList(
  signer: ISigner,
  pubkey: string,
  event: Event
): Promise<string[]> {
  if (event.kind !== PRIVATE_RELAY_LIST_KIND || event.pubkey !== pubkey) return []
  if (!signer.nip44) throw new Error('Signer does not support NIP-44 encryption')

  const plaintext = await signer.nip44.decrypt(pubkey, event.content)
  const parsed: unknown = JSON.parse(plaintext)
  if (!Array.isArray(parsed)) throw new Error('Invalid private relay list')

  const urls = parsed.flatMap(tag =>
    Array.isArray(tag) && tag[0] === 'relay' && typeof tag[1] === 'string' ? [tag[1]] : []
  )

  return normalizePrivateRelayUrls(urls)
}

export async function publishPrivateEvent(
  pool: Pick<RelayPool, 'publish'>,
  relays: readonly string[],
  event: Event
): Promise<void> {
  const privateRelays = normalizePrivateRelayUrls(relays)
  if (privateRelays.length === 0) {
    throw new Error('Configure at least one private relay before publishing private content')
  }

  const responses = await pool.publish(privateRelays, event)
  if (!responses.some(response => response.ok)) {
    const reasons = responses
      .map(response => response.message)
      .filter(Boolean)
      .join('; ')
    throw new Error(reasons || 'All private relays rejected the event')
  }
}

export function monitorPrivateRelayAuthentication(
  pool: PrivateRelayConnectionPool,
  relays: readonly string[],
  signer: ISigner,
  pubkey: string,
  onStatus: (url: string, status: PrivateRelayStatus, error?: Error) => void
): () => void {
  const subscriptions = normalizePrivateRelayUrls(relays).flatMap(url => {
    const relay = pool.relay(url)
    let authentication: Promise<void> | undefined

    const connectedSubscription = relay.connected$.subscribe(connected => {
      onStatus(
        url,
        connected
          ? relay.authenticatedAs === pubkey
            ? 'authenticated'
            : 'connected'
          : 'disconnected'
      )
    })

    const authenticatedSubscription = relay.authenticatedAs$.subscribe(authenticatedAs => {
      if (authenticatedAs === pubkey) onStatus(url, 'authenticated')
    })

    const challengeSubscription = relay.challenge$.subscribe(challenge => {
      if (!challenge || relay.authenticatedAs === pubkey || authentication) return

      onStatus(url, 'authenticating')
      authentication = relay
        .authenticate(signer)
        .then(response => {
          if (!response.ok) throw new Error(response.message || 'Relay rejected authentication')
          onStatus(url, 'authenticated')
        })
        .catch(cause => {
          const error = cause instanceof Error ? cause : new Error('Relay authentication failed')
          onStatus(url, 'error', error)
        })
        .finally(() => {
          authentication = undefined
        })
    })

    return [connectedSubscription, authenticatedSubscription, challengeSubscription]
  })

  return () => subscriptions.forEach(subscription => subscription.unsubscribe())
}
