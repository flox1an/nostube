import { useSyncExternalStore } from 'react'
import { getInstallState, subscribeInstallState } from '../install-prompt'

export function useInstallState() {
  return useSyncExternalStore(subscribeInstallState, getInstallState)
}
