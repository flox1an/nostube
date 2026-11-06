import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { describe, expect, it, vi } from 'vitest'
import { TrustBadgeDisplay } from './TrustBadge'

vi.mock('@/components/TrustScoreDebugPanel', () => ({ TrustScoreDialog: () => null }))

describe('trust badge', () => {
  it('keeps low trust accessible while hiding its label in compact chat', () => {
    const { rerender } = render(
      <TooltipProvider>
        <TrustBadgeDisplay pubkey="author" score={0} compact />
      </TooltipProvider>
    )
    expect(screen.getByRole('button', { name: /low trust/i })).not.toHaveTextContent('Low')
    rerender(
      <TooltipProvider>
        <TrustBadgeDisplay pubkey="author" score={0} />
      </TooltipProvider>
    )
    expect(screen.getByRole('button', { name: /low trust/i })).toHaveTextContent('Low')
  })
})
