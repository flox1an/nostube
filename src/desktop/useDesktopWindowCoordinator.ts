import { invoke, isTauri } from '@tauri-apps/api/core'
import { useMemo } from 'react'
import {
  createTauriDesktopWindowCoordinator,
  type DesktopWindowCoordinator,
} from './window-coordinator'

export const useDesktopWindowCoordinator = (): DesktopWindowCoordinator | undefined =>
  useMemo(() => (isTauri() ? createTauriDesktopWindowCoordinator(invoke) : undefined), [])
