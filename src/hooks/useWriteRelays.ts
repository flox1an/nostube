import { useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { useUserRelaysContext } from '@/contexts/UserRelaysContext'
import { getInstanceConfig } from '@/lib/instance-config'

/**
 * Returns write relays from app configuration
 */
export function useWriteRelays(): string[] {
  const { config } = useAppContext()
  const { writeRelays } = useUserRelaysContext()

  const configuredRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
    [config.relays]
  )

  // Instance build: always the interaction relays from the overlay, never the user's NIP-65.
  return writeRelays && writeRelays.length > 0 && !getInstanceConfig()
    ? writeRelays
    : configuredRelays
}
