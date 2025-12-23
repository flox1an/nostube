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
  const relaysKey = relaysFromHook.join(',')
  // relaysKey is a stable serialization - when it changes, we want to return a new array
  return useMemo(() => relaysFromHook, [relaysKey, relaysFromHook])
}
