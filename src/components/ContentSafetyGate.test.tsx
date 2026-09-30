import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentSafetyRoute } from './ContentSafetyGate'

afterEach(cleanup)

describe('ContentSafetyRoute', () => {
  it('does not mount a protected route when hidden', () => {
    const ProtectedRoute = vi.fn(() => <div>Protected route</div>)

    render(
      <ContentSafetyRoute safetyGate="hidden">
        <ProtectedRoute />
      </ContentSafetyRoute>
    )

    expect(ProtectedRoute).not.toHaveBeenCalled()
    expect(screen.queryByText('Protected route')).not.toBeInTheDocument()
  })

  it('mounts the protected route when visible', () => {
    const ProtectedRoute = vi.fn(() => <div>Protected route</div>)

    render(
      <ContentSafetyRoute safetyGate="visible">
        <ProtectedRoute />
      </ContentSafetyRoute>
    )

    expect(ProtectedRoute).toHaveBeenCalledOnce()
    expect(screen.getByText('Protected route')).toBeInTheDocument()
  })
})
