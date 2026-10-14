import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AccountsContext } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'

// The QR tab is the default; its handshake is not under test here.
vi.mock('./QRCodeLogin', () => ({ QRCodeLogin: () => null }))

import LoginDialog from './LoginDialog'

type NostrWindow = { nostr?: object }
const extension = { getPublicKey: async () => 'a'.repeat(64), signEvent: async () => ({}) }

const renderDialog = (onSignup?: () => void) =>
  render(
    <AccountsContext.Provider value={new AccountManager()}>
      <LoginDialog isOpen onClose={vi.fn()} onLogin={vi.fn()} onSignup={onSignup} relays={[]} />
    </AccountsContext.Provider>
  )

afterEach(() => {
  delete (window as NostrWindow).nostr
  vi.useRealTimers()
})

describe('LoginDialog', () => {
  it('offers signing up only when the host handles it', () => {
    const { unmount } = renderDialog()
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull()
    unmount()
    renderDialog(vi.fn())
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
  })

  it('offers the extension login on a desktop browser without an extension, with a hint', () => {
    renderDialog()
    const tab = screen.getByRole('tab', { name: 'Extension' })
    expect(tab).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByText('Recommended')).toBeNull()
    fireEvent.mouseDown(tab)
    expect(screen.getByText(/No extension found in this browser/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login with Extension' })).toBeEnabled()
  })

  it('picks up an extension that injects after the dialog opened and recommends it', async () => {
    vi.useFakeTimers()
    renderDialog()
    expect(screen.getByRole('tab', { name: 'QR' })).toHaveAttribute('aria-selected', 'true')
    ;(window as NostrWindow).nostr = extension
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('tab', { name: /Extension/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })
})
