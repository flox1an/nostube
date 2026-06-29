import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsMenu } from './SettingsMenu'
import type { QualityOption } from './engines'

vi.mock('@/hooks/useProfile', () => ({
  useProfile: (user?: { pubkey: string }) => {
    if (user?.pubkey === 'alice-pubkey') {
      return { display_name: 'Alice', picture: 'https://images.example.com/alice.jpg' }
    }
    if (user?.pubkey === 'bob-pubkey') return { name: 'Bob' }
    return undefined
  },
}))

const openQualityMenu = (qualityOptions: QualityOption[]) => {
  render(
    <SettingsMenu
      qualityOptions={qualityOptions}
      selectedQuality={0}
      onSelectQuality={vi.fn()}
      playbackRate={1}
      onPlaybackRateChange={vi.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Quality/i }))
}

describe('SettingsMenu quality labels', () => {
  it('labels duplicate contributed variant heights with contributor names', () => {
    openQualityMenu([
      { id: 0, label: '720p' },
      { id: 1, label: '480p', contributorPubkey: 'alice-pubkey' },
      { id: 2, label: '480p', contributorPubkey: 'bob-pubkey' },
    ])

    expect(screen.getByRole('menuitemradio', { name: '720p' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: '480p (Alice)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: '480p (Bob)' })).toBeInTheDocument()
  })

  it('shows a compact contributor avatar before contributed variant names', () => {
    openQualityMenu([
      { id: 0, label: '720p' },
      { id: 1, label: '480p', contributorPubkey: 'alice-pubkey' },
    ])

    const contributedOption = screen.getByRole('menuitemradio', { name: '480p (Alice)' })
    const avatar = contributedOption.querySelector('[data-contributor-avatar]')

    expect(avatar).toHaveClass('h-4', 'w-4')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
  })
})
