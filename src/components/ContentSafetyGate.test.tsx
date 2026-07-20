import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentSafetyRoute } from './ContentSafetyGate'

afterEach(cleanup)

describe('ContentSafetyRoute', () => {
  it('does not mount a protected route when hidden', () => {
    const ProtectedRoute = vi.fn(() => <div>Protected route</div>)

    render(
      <ContentSafetyRoute safetyGate="hidden" onGoHome={vi.fn()}>
        <ProtectedRoute />
      </ContentSafetyRoute>
    )

    expect(ProtectedRoute).not.toHaveBeenCalled()
    expect(screen.queryByText('Protected route')).not.toBeInTheDocument()
  })
  it('does not mount a protected route behind the warning and exits home', () => {
    const onGoHome = vi.fn()
    const ProtectedRoute = vi.fn(() => <div>Protected route</div>)

    render(
      <ContentSafetyRoute safetyGate="warning" onGoHome={onGoHome}>
        <ProtectedRoute />
      </ContentSafetyRoute>
    )

    expect(ProtectedRoute).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button'))
    expect(onGoHome).toHaveBeenCalledOnce()
  })

  it('mounts the protected route when visible', () => {
    const ProtectedRoute = vi.fn(() => <div>Protected route</div>)

    render(
      <ContentSafetyRoute safetyGate="visible" onGoHome={vi.fn()}>
        <ProtectedRoute />
      </ContentSafetyRoute>
    )

    expect(ProtectedRoute).toHaveBeenCalledOnce()
    expect(screen.getByText('Protected route')).toBeInTheDocument()
  })
})
