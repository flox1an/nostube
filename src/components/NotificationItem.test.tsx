import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationItem } from './NotificationItem'
import type { VideoNotification } from '../types/notification'

// Mock the hooks
vi.mock('../hooks/useProfile', () => ({
  useProfile: vi.fn(() => ({
    displayName: 'Test User',
    picture: 'https://example.com/avatar.jpg',
  })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'notifications.commentedOnYourVideo': 'commented on your video',
      }
      return translations[key] || key
    },
    i18n: { language: 'en' },
  })),
}))

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils')
  return {
    ...(actual as object),
    imageProxy: (url?: string) => url || '',
  }
})

describe('NotificationItem', () => {
  const mockNotification: VideoNotification = {
    id: 'note1',
    commentId: 'note1',
    videoId: 'video1',
    videoTitle: 'Test Video',
    commenterPubkey: 'pubkey123',
    commentContent: 'Great video!',
    timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    read: false,
    videoEventId: 'nevent1...',
  }

  it('should render notification with avatar and text', () => {
    const onClick = vi.fn()
    render(<NotificationItem notification={mockNotification} onClick={onClick} />)

    expect(screen.getByText(/commented on your video/i)).toBeInTheDocument()
    expect(screen.getByText('Test Video')).toBeInTheDocument()
    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('should call onClick when clicked', () => {
    const onClick = vi.fn()
    render(<NotificationItem notification={mockNotification} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(mockNotification)
  })

  it('should show different styling for read notifications', () => {
    const readNotification = { ...mockNotification, read: true }
    const { container } = render(
      <NotificationItem notification={readNotification} onClick={vi.fn()} />
    )

    expect(container.firstChild).toHaveClass('opacity-60')
  })

  it('should not show opacity for unread notifications', () => {
    const { container } = render(
      <NotificationItem notification={mockNotification} onClick={vi.fn()} />
    )

    expect(container.firstChild).not.toHaveClass('opacity-60')
  })

  it('should display relative time', () => {
    render(<NotificationItem notification={mockNotification} onClick={vi.fn()} />)

    // Should show "about 1 hour ago" or similar
    expect(screen.getByText(/hour ago/i)).toBeInTheDocument()
  })

  it('should handle missing video title gracefully', () => {
    const notificationNoTitle = { ...mockNotification, videoTitle: undefined }
    render(<NotificationItem notification={notificationNoTitle} onClick={vi.fn()} />)

    expect(screen.getByText(/commented on your video/i)).toBeInTheDocument()
    expect(screen.queryByText('Test Video')).not.toBeInTheDocument()
  })

  it('should truncate video title if too long', () => {
    const notificationLongTitle = {
      ...mockNotification,
      videoTitle: 'This is a very long video title that should be truncated',
    }
    render(<NotificationItem notification={notificationLongTitle} onClick={vi.fn()} />)

    const titleElement = screen.getByText(
      'This is a very long video title that should be truncated'
    )
    expect(titleElement).toHaveClass('truncate')
  })

  it('should show fallback name when profile has no displayName', async () => {
    const { useProfile } = await import('../hooks/useProfile')
    vi.mocked(useProfile).mockReturnValue(undefined)

    render(<NotificationItem notification={mockNotification} onClick={vi.fn()} />)

    // Should show first 8 chars of pubkey
    expect(screen.getByText('pubkey12')).toBeInTheDocument()
  })

  it('should use hover effect on button', () => {
    const { container } = render(
      <NotificationItem notification={mockNotification} onClick={vi.fn()} />
    )

    expect(container.firstChild).toHaveClass('hover:bg-muted/50')
  })

  it('should render avatar with correct size', () => {
    const { container } = render(
      <NotificationItem notification={mockNotification} onClick={vi.fn()} />
    )

    const avatar = container.querySelector('.h-8')
    expect(avatar).toBeInTheDocument()
  })
})
