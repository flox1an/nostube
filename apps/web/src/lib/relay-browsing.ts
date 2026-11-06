import { nip19, type NostrEvent } from 'nostr-tools'
import { isRelaySecureForPage } from '@nostube/core/client'
import { isRelayAllowed } from '@nostube/core/instance-config'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import i18n from '@/i18n/config'

export interface BrowseSource {
  title: string
  relays: string[]
  /** NIP-19 address of a public kind-30002 set, not a copy owned by this client. */
  address?: string
}

// Bound fan-out rather than silently dropping members of an imported set.
export const MAX_BROWSE_RELAYS = 12

export function normalizeBrowseRelay(input: string): string {
  const value = input.trim()
  if (!value || /\s/.test(value))
    throw new Error(
      i18n.t('relaySource.errors.url', { defaultValue: 'Enter a relay hostname or WebSocket URL.' })
    )
  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `wss://${value}`)
  } catch (cause) {
    throw Object.assign(new Error(i18n.t('relaySource.errors.url')), { cause })
  }
  if (
    !['wss:', 'ws:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      i18n.t('relaySource.errors.protocol', {
        defaultValue: 'Use a ws:// or wss:// relay URL without credentials or a fragment.',
      })
    )
  }
  const normalized = url.toString().replace(/\/$/, '')
  if (!isRelaySecureForPage(normalized))
    throw new Error(
      i18n.t('relaySource.errors.secure', {
        defaultValue: 'This page cannot connect securely to that relay. Use wss://.',
      })
    )
  if (!isRelayAllowed(normalized))
    throw new Error(
      i18n.t('relaySource.errors.instance', {
        defaultValue: 'This relay is not allowed by this instance.',
      })
    )
  return normalized
}

export function relaySource(input: string): BrowseSource {
  const url = normalizeBrowseRelay(input)
  return { title: url.replace(/^wss?:\/\//, ''), relays: [url] }
}

export function sourceKey(source: BrowseSource): string {
  if (!source.address) return JSON.stringify([...source.relays].sort())
  const pointer = decodeRelaySet(source.address)
  return `${pointer.kind}:${pointer.pubkey}:${pointer.identifier}`
}

export function decodeRelaySet(input: string) {
  const value = input.trim().replace(/^nostr:/i, '')
  let decoded: ReturnType<typeof nip19.decode>
  try {
    decoded = nip19.decode(value)
  } catch (cause) {
    throw Object.assign(new Error(i18n.t('relaySource.errors.setAddress')), { cause })
  }
  if (decoded.type !== 'naddr' || decoded.data.kind !== 30002) {
    throw new Error(
      i18n.t('relaySource.errors.setAddress', {
        defaultValue: 'Use an naddr link to a relay set (kind 30002).',
      })
    )
  }
  return decoded.data
}

export function relaySetSource(event: NostrEvent): BrowseSource {
  const identifier = event.tags.find(tag => tag[0] === 'd')?.[1]
  if (event.kind !== 30002 || identifier === undefined)
    throw new Error('This event is not a relay set.')
  const entries = event.tags.filter(tag => tag[0] === 'relay' && tag[1]).map(tag => tag[1])
  if (!entries.length)
    throw new Error(
      i18n.t('relaySource.errors.privateSet', {
        defaultValue:
          'This set has no publicly readable relays. Private entries are not decrypted.',
      })
    )
  // Do not silently show a different set when members are malformed or disallowed.
  const relays = [...new Set(entries.map(normalizeBrowseRelay))]
  if (relays.length > MAX_BROWSE_RELAYS) {
    throw new Error(
      i18n.t('relaySource.errors.tooMany', {
        count: relays.length,
        max: MAX_BROWSE_RELAYS,
        defaultValue: 'This set has {{count}} relays. Open a set with at most {{max}} relays.',
      })
    )
  }
  return {
    title: event.tags.find(tag => tag[0] === 'title')?.[1] || identifier || 'Relay set',
    relays,
    address: nip19.naddrEncode({
      kind: 30002,
      pubkey: event.pubkey,
      identifier,
      relays: [...(getSeenRelays(event) ?? [])].slice(0, 3),
    }),
  }
}

export function sourceSearch(source: BrowseSource | null, search = ''): string {
  const params = new URLSearchParams(search)
  params.delete('relay')
  params.delete('relaySet')
  if (source?.address) params.set('relaySet', source.address)
  else source?.relays.forEach(url => params.append('relay', normalizeBrowseRelay(url)))
  const result = params.toString()
  return result ? `?${result}` : ''
}

export function sourceFromSearch(search: string): BrowseSource | null {
  const params = new URLSearchParams(search)
  const address = params.get('relaySet')
  if (address) {
    decodeRelaySet(address)
    return { title: 'Relay set', relays: [], address: address.replace(/^nostr:/i, '') }
  }
  const relays = [...new Set(params.getAll('relay').map(normalizeBrowseRelay))]
  if (relays.length > MAX_BROWSE_RELAYS)
    throw new Error(
      i18n.t('relaySource.errors.tooMany', {
        count: relays.length,
        max: MAX_BROWSE_RELAYS,
        defaultValue: 'This source has {{count}} relays. Open at most {{max}} relays at once.',
      })
    )
  return relays.length
    ? { title: relays.length === 1 ? relaySource(relays[0]).title : 'Relays', relays }
    : null
}
