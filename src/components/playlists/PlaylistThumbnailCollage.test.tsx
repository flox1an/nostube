import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlaylistThumbnailCollage } from './PlaylistThumbnailCollage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'contentSafety.loading': 'Loading playlist safety',
        'contentSafety.warning.title': 'Sensitive content',
      })[key] ?? key,
  }),
}))

describe('PlaylistThumbnailCollage safety states', () => {
  it('renders a non-image placeholder while playlist safety is pending', () => {
    render(<PlaylistThumbnailCollage videoIds={['video-id']} safetyState="pending" />)

    expect(screen.getByRole('status', { name: 'Loading playlist safety' })).toBeInTheDocument()
    expect(document.querySelector('.blur-lg')).not.toBeInTheDocument()
  })

  it('blurs unsafe playlists and shows their warning reason', () => {
    render(
      <PlaylistThumbnailCollage
        videoIds={[]}
        safetyState="unsafe"
        contentWarning="Adult material"
      />
    )

    expect(screen.getByText('Sensitive content')).toBeInTheDocument()
    expect(screen.getByText('Adult material')).toBeInTheDocument()
    expect(document.querySelector('.blur-lg')).toBeInTheDocument()
  })

  it('renders clean playlists without a safety overlay', () => {
    render(<PlaylistThumbnailCollage videoIds={[]} safetyState="clean" />)

    expect(screen.queryByText('Sensitive content')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
