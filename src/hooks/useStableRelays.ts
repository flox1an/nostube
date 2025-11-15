import { useMemo } from 'react'
import { useReadRelays } from './useReadRelays'

/**
 * Returns a stable relay array reference that only changes when relay URLs actually change.
 * This prevents unnecessary re-renders and effect triggers when the array reference changes
 * but the content is the same.
 *
 * @returns Array of relay URLs
 */
export function useStableRelays(): string[] {
  const relaysFromHook = useReadRelays()
  return useMemo(() => relaysFromHook, [relaysFromHook.join(',')])
}
