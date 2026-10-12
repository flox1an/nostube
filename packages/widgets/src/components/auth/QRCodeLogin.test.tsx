import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { AccountsContext } from 'applesauce-react'
import type { AccountManager } from 'applesauce-accounts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Waits like applesauce's signer: rejects with "Aborted" when the signal aborts.
vi.mock('applesauce-signers', () => ({
  NostrConnectSigner: class {
    static buildSigningPermissions = () => []
    getNostrConnectURI = () => 'nostrconnect://test'
    waitForSigner = (signal: AbortSignal) =>
      new Promise<void>((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Aborted')))
      )
  },
}))

import { QRCodeLogin } from './QRCodeLogin'

describe('QRCodeLogin', () => {
  it('stays silent when the dialog re-renders and then switches away from the QR tab', async () => {
    const onError = vi.fn()
    const manager = {} as AccountManager
    const view = () => (
      <AccountsContext.Provider value={manager}>
        {/* A new onLogin each render, as LoginDialog passes it: every render restarts the wait. */}
        <QRCodeLogin onLogin={() => {}} onError={onError} relays={['wss://relay.example']} />
      </AccountsContext.Provider>
    )
    const { rerender, unmount } = render(view())
    rerender(view())
    rerender(view())
    unmount()
    await act(async () => {})

    expect(onError).not.toHaveBeenCalled()
  })
})
