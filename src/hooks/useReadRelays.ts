import { useMemo } from 'react'
import { useAppContext } from './useAppContext'
import { useUserRelaysContext } from '@/contexts/UserRelaysContext'

/**
 * Returns read relays from app configuration
 */
export function useReadRelays(): string[] {
  const { config } = useAppContext()
  const { readRelays } = useUserRelaysContext()

  const configuredRelays = useMemo(
    () => config.relays.filter(r => r.tags.includes('read')).map(r => r.url),
    [config.relays]
  )

  return readRelays && readRelays.length > 0 ? readRelays : configuredRelays
}
