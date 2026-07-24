import { createContext, useContext } from 'react'

type DesktopPlayerControls = {
  isInspectorOpen: boolean
  toggleInspector: () => void
}

export const DesktopPlayerControlsContext = createContext<DesktopPlayerControls | undefined>(
  undefined
)

export const useDesktopPlayerControls = () => useContext(DesktopPlayerControlsContext)
