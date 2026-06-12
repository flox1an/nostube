import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContributedVariantDebugSection } from './VideoDebugInfo'
import type { ContributedVariantDebugRecord } from '@/hooks/useContributedVariants'

const contributedRecord: ContributedVariantDebugRecord = {
  eventId: 'contribution-event-id',
  eventKind: 1063,
  pubkey: 'contributor-pubkey',
  createdAt: 2,
  hash: 'variant-hash',
  url: 'https://cdn.example.com/variant.mp4',
  fallbackUrls: ['https://fallback.example.com/variant.mp4'],
  mimeType: 'video/mp4',
  dimensions: '854x480',
  quality: '480p',
  tags: [
    ['url', 'https://cdn.example.com/variant.mp4'],
    ['x', 'variant-hash'],
  ],
  status: 'accepted',
  reachableUrl: 'https://cdn.example.com/variant.mp4',
  statusCode: 200,
}

describe('ContributedVariantDebugSection', () => {
  it('is hidden with no 1063 records', () => {
    const { container } = render(<ContributedVariantDebugSection records={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('collapses contributed 1063 details by default', () => {
    render(<ContributedVariantDebugSection records={[contributedRecord]} />)

    expect(screen.getByText('Contributed Video Variants')).toBeInTheDocument()
    expect(screen.queryByText('contribution-event-id')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Contributed Video Variants'))

    expect(screen.getByText('contribution-event-id')).toBeInTheDocument()
    expect(screen.getByText('kind 1063')).toBeInTheDocument()
    expect(screen.getByText('contributor-pubkey')).toBeInTheDocument()
    expect(screen.getAllByText('https://cdn.example.com/variant.mp4')).toHaveLength(2)
    expect(screen.getByText('https://fallback.example.com/variant.mp4')).toBeInTheDocument()
    expect(screen.getByText('accepted')).toBeInTheDocument()
  })
})
