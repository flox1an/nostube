import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
  }),
}))

vi.mock('./LoginDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="login-dialog" /> : null,
}))
vi.mock('./SignupDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="signup-dialog" /> : null,
}))

import { AuthDialog } from './AuthDialog'

describe('AuthDialog', () => {
  it('leads with a Create account / Sign in choice before either flow', () => {
    render(<AuthDialog isOpen onClose={vi.fn()} onLogin={vi.fn()} />)

    expect(screen.getByTestId('auth-entry-create-account')).toBeInTheDocument()
    expect(screen.getByTestId('auth-entry-sign-in')).toBeInTheDocument()
    expect(screen.queryByTestId('login-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('signup-dialog')).not.toBeInTheDocument()
  })

  it('routes "Sign in" to the existing LoginDialog flow', () => {
    render(<AuthDialog isOpen onClose={vi.fn()} onLogin={vi.fn()} />)

    fireEvent.click(screen.getByTestId('auth-entry-sign-in'))

    expect(screen.getByTestId('login-dialog')).toBeInTheDocument()
  })

  it('routes "Create account" to the existing SignupDialog flow', () => {
    render(<AuthDialog isOpen onClose={vi.fn()} onLogin={vi.fn()} />)

    fireEvent.click(screen.getByTestId('auth-entry-create-account'))

    expect(screen.getByTestId('signup-dialog')).toBeInTheDocument()
  })

  it('resets to the choice screen each time it is reopened', () => {
    const { rerender } = render(<AuthDialog isOpen onClose={vi.fn()} onLogin={vi.fn()} />)
    fireEvent.click(screen.getByTestId('auth-entry-sign-in'))
    expect(screen.getByTestId('login-dialog')).toBeInTheDocument()

    rerender(<AuthDialog isOpen={false} onClose={vi.fn()} onLogin={vi.fn()} />)
    rerender(<AuthDialog isOpen onClose={vi.fn()} onLogin={vi.fn()} />)

    expect(screen.getByTestId('auth-entry-create-account')).toBeInTheDocument()
  })
})
