export type DesktopWindowKind = 'auth' | 'main' | 'player'

export interface DesktopWindowCoordinator {
  focusMain(): Promise<void>
  openAuth(): Promise<void>
  openPlayer(route: string): Promise<void>
}

type Invoke = (
  command: 'open_desktop_window',
  args: { kind: DesktopWindowKind; route?: string }
) => Promise<unknown>

type Navigate = (route: string) => void

export const createTauriDesktopWindowCoordinator = (invoke: Invoke): DesktopWindowCoordinator => ({
  focusMain: async () => {
    await invoke('open_desktop_window', { kind: 'main' })
  },
  openAuth: async () => {
    await invoke('open_desktop_window', { kind: 'auth' })
  },
  openPlayer: async route => {
    await invoke('open_desktop_window', { kind: 'player', route })
  },
})

export const createBrowserDesktopWindowCoordinator = (
  navigate: Navigate
): DesktopWindowCoordinator => ({
  focusMain: async () => undefined,
  openAuth: async () => undefined,
  openPlayer: async route => {
    navigate(route)
  },
})
