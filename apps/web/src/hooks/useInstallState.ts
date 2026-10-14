import { useSyncExternalStore } from 'react'
import { getInstallState, subscribeInstallState } from '@/lib/install-prompt'

export function useInstallState() {
  return useSyncExternalStore(subscribeInstallState, getInstallState)
}
