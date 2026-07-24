import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopAuthPage } from './DesktopAuthPage'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: vi.fn() }),
}))

afterEach(() => {
  invoke.mockReset()
})

describe('DesktopAuthPage', () => {
  it('shows the native nsec import rejection', async () => {
    invoke.mockRejectedValue('Could not save desktop credential in Keychain: authorization denied')

    render(<DesktopAuthPage />)

    fireEvent.change(screen.getByLabelText('Nostr credential'), {
      target: { value: 'nsec1j4c6269y9w0q2er2xjw8sv2ehyrtfxq3jwgdlxj6qfn8z4gjsq5qfvfk99' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import account' }))

    expect(
      await screen.findByText('Could not save desktop credential in Keychain: authorization denied')
    ).toBeInTheDocument()
  })
})
