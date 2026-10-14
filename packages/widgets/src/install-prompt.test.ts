import { describe, expect, it } from 'vitest'
import {
  type InstallState,
  dismissInstallBanner,
  getInstallState,
  shouldShowInstallBanner,
  startInstallPromptCapture,
} from './install-prompt'

const secondVisit: InstallState = {
  visits: 2,
  dismissed: false,
  installed: false,
  standalone: false,
  ios: false,
  canPrompt: true,
}

describe('shouldShowInstallBanner', () => {
  it('never shows on the first visit', () => {
    expect(shouldShowInstallBanner({ ...secondVisit, visits: 1 })).toBe(false)
  })

  it('shows from the second visit with a prompt or on iOS', () => {
    expect(shouldShowInstallBanner(secondVisit)).toBe(true)
    expect(shouldShowInstallBanner({ ...secondVisit, canPrompt: false, ios: true })).toBe(true)
  })

  it('stays hidden when the browser cannot install', () => {
    expect(shouldShowInstallBanner({ ...secondVisit, canPrompt: false })).toBe(false)
  })

  it('stays hidden after dismissal, installation or in standalone', () => {
    expect(shouldShowInstallBanner({ ...secondVisit, dismissed: true })).toBe(false)
    expect(shouldShowInstallBanner({ ...secondVisit, installed: true })).toBe(false)
    expect(shouldShowInstallBanner({ ...secondVisit, standalone: true })).toBe(false)
  })
})

describe('startInstallPromptCapture', () => {
  it('counts one visit per session and remembers dismissal and installation', () => {
    localStorage.clear()
    sessionStorage.clear()

    startInstallPromptCapture()
    startInstallPromptCapture()
    expect(getInstallState().visits).toBe(1)

    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }))
    expect(shouldShowInstallBanner(getInstallState())).toBe(false)

    sessionStorage.clear() // next session
    startInstallPromptCapture()
    expect(getInstallState().visits).toBe(2)
    expect(shouldShowInstallBanner(getInstallState())).toBe(true)

    dismissInstallBanner()
    startInstallPromptCapture()
    expect(getInstallState().dismissed).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))
    expect(localStorage.getItem('nostube_app_installed')).toBe('1')
    expect(getInstallState()).toMatchObject({ installed: true, canPrompt: false })
  })
})
