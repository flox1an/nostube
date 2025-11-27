import { useMemo } from 'react'
import { useAppContext } from './useAppContext'

/**
 * Returns read relays from app configuration (localStorage config with "read" tag)
 * Does NOT use NIP-65 relay list - uses explicit app config only
 */
export function useReadRelays(): string[] {
  const { config } = useAppContext()

  const configuredRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  return configuredRelays
}
