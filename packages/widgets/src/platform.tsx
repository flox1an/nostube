import { createContext, useContext, type ReactNode } from 'react'

/**
 * The native window of a desktop shell (Tauri). Absent in the browser, where the player uses
 * the DOM Fullscreen API. The host provides it; widgets never import a shell API themselves.
 */
export interface NativeWindow {
  setFullscreen(fullscreen: boolean): Promise<void>
  isFullscreen(): Promise<boolean>
}

export interface Platform {
  nativeWindow?: NativeWindow
}

const PlatformContext = createContext<Platform>({})

export function PlatformProvider({ value, children }: { value: Platform; children: ReactNode }) {
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

/** The desktop shell's capabilities; empty in the browser. */
export const usePlatform = () => useContext(PlatformContext)

type DesktopPlayerControls = {
  isInspectorOpen: boolean
  toggleInspector: () => void
}

/** Provided by the desktop player shell; undefined elsewhere. */
export const DesktopPlayerControlsContext = createContext<DesktopPlayerControls | undefined>(
  undefined
)

export const useDesktopPlayerControls = () => useContext(DesktopPlayerControlsContext)
