import { useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { useUserRelaysContext } from '@/contexts/UserRelaysContext'

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

  return writeRelays && writeRelays.length > 0 ? writeRelays : configuredRelays
}
