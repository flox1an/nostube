import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserDesktopWindowCoordinator,
  createTauriDesktopWindowCoordinator,
} from './window-coordinator'

describe('DesktopWindowCoordinator', () => {
  it('opens a selected player through the native host with its public route', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    const coordinator = createTauriDesktopWindowCoordinator(invoke)

    await coordinator.openPlayer('/desktop/player/nevent1selectedvideo')

    expect(invoke).toHaveBeenCalledWith('open_desktop_window', {
      kind: 'player',
      route: '/desktop/player/nevent1selectedvideo',
    })
  })

  it('keeps browser player selection in the current window', async () => {
    const navigate = vi.fn()
    const coordinator = createBrowserDesktopWindowCoordinator(navigate)

    await coordinator.openPlayer('/v/nevent1selectedvideo')

    expect(navigate).toHaveBeenCalledWith('/v/nevent1selectedvideo')
  })
})
