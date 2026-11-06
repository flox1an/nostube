import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useTrustFilter } from './useTrustFilter'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import type { ReactElement } from 'react'
import i18n from '@/i18n/config'

vi.mock('@/hooks/useTrustScore', () => ({
  useTrustScores: () => new Map(),
  useGlobalScores: () => new Map(),
}))
vi.mock('@/hooks/useFollowSet', () => ({
  useFollowSet: () => ({ followedPubkeys: [] }),
}))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: null }),
}))

let latest: { enabled: boolean; filterButton: ReactElement }
function Harness() {
  latest = useTrustFilter(null)
  return <TooltipProvider delayDuration={0}>{latest.filterButton}</TooltipProvider>
}

function clickShield() {
  fireEvent.click(screen.getByRole('button'))
}

describe('useTrustFilter first-time disable warning', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('first disable shows warning and keeps filter enabled until confirmed', () => {
    render(<Harness />)
    expect(latest.enabled).toBe(true)

    clickShield()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(latest.enabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: i18n.t('trust.filterWarning.cancel') }))
    expect(latest.enabled).toBe(true)
    expect(localStorage.getItem('trustFilter.enabled')).toBe('true')
  })

  it('confirm disables the filter and marks the warning as shown', () => {
    render(<Harness />)
    clickShield()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('trust.filterWarning.confirm') }))

    expect(latest.enabled).toBe(false)
    expect(localStorage.getItem('trustFilter.warningShown')).toBe('true')
    expect(localStorage.getItem('trustFilter.enabled')).toBe('false')
  })

  it('does not warn again once shown', () => {
    render(<Harness />)
    clickShield()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('trust.filterWarning.confirm') }))

    // toggle back on
    clickShield()
    expect(latest.enabled).toBe(true)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
