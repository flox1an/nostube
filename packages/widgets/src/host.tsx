import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { RelayPool } from 'applesauce-relay'
import type { AppConfig } from '@nostube/core'

/** The settings the shared hooks and widgets read. A host's full AppConfig satisfies it. */
export type HostConfig = Pick<
  AppConfig,
  'relays' | 'blossomServers' | 'cachingServers' | 'preferredQuality' | 'imgproxyBaseUrl' | 'media'
>

/** Relays the shared hooks look things up on. The host decides them (instance builds narrow them). */
export interface HostRelays {
  /** The viewer's read relays (their NIP-65 list, the preset or the instance relays). */
  read: string[]
  /** NIP-65 relay lists and file-metadata discovery. */
  indexer: string[]
  /** Profile metadata (kind 0). */
  metadata: string[]
  /** Zap receipts (kind 9735). */
  zap: string[]
}

export interface NostubeHost {
  config: HostConfig
  pool: RelayPool
  relays: HostRelays
}

const NostubeHostContext = createContext<NostubeHost | undefined>(undefined)

export function NostubeHostProvider({
  value,
  children,
}: {
  value: NostubeHost
  children: ReactNode
}) {
  return <NostubeHostContext.Provider value={value}>{children}</NostubeHostContext.Provider>
}

/** Builds a stable host value; pass the pieces the host already holds. */
export function useNostubeHostValue(
  config: HostConfig,
  pool: RelayPool,
  relays: HostRelays
): NostubeHost {
  return useMemo(() => ({ config, pool, relays }), [config, pool, relays])
}

/**
 * The host's config, relay pool and lookup relays. Throws without a provider: a silent default
 * would drop Blossom failover and relay lookups without any error.
 */
export function useNostubeHost(): NostubeHost {
  const host = useContext(NostubeHostContext)
  if (!host) throw new Error('useNostubeHost must be used within a NostubeHostProvider')
  return host
}

/** Like useNostubeHost, for components that also render without a host (tests, previews). */
export function useNostubeHostSafe(): NostubeHost | undefined {
  return useContext(NostubeHostContext)
}
