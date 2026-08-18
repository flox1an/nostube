import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftCard } from './DraftCard'
import type { UploadDraft } from '@/types/upload-draft'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'
import { AppProvider } from '@/components/AppProvider'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { eventStore } from '@/nostr/core'

const mockDraft: UploadDraft = {
  id: 'test-id',
  createdAt: Date.now() - 2 * 3600000, // 2 hours ago
  updatedAt: Date.now() - 2 * 3600000,
  title: 'My Test Video',
  description: 'Test description',
  tags: ['test'],
  language: 'en',
  people: [],
  contentWarning: { enabled: false, reason: '' },
  expiration: 'none',
  inputMethod: 'file',
  uploadInfo: {
    videos: [
      {
        url: 'http://test.com/video',
        inputMethod: 'file',
        dimension: '1920x1080',
        duration: 120,
        sizeMB: 450,
        uploadedBlobs: [
          {
            url: 'http://test.com/video',
            sha256: 'abc',
            size: 100,
            type: 'video/mp4',
            uploaded: Date.now(),
          },
        ],
        mirroredBlobs: [],
        placement: {
          primaryBlob: {
            url: 'http://test.com/video',
            sha256: 'abc',
            size: 100,
            type: 'video/mp4',
            uploaded: Date.now(),
          },
          fallbackBlobs: [],
        },
      },
    ],
  },
  thumbnailUploadInfo: {
    uploadedBlobs: [
      {
        url: 'http://test.com/thumb.jpg',
        sha256: 'def',
        size: 10,
        type: 'image/jpeg',
        uploaded: Date.now(),
      },
    ],
    mirroredBlobs: [],
  },
  subtitles: [],
  thumbnailSource: 'generated',
}

const accountManager = new AccountManager()

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider
    storageKey="test-draft-card"
    defaultConfig={{
      theme: 'light',
      relays: [],
      videoType: 'videos',
      nsfwFilter: 'warning',
    }}
  >
    <AccountsProvider manager={accountManager}>
      <EventStoreProvider eventStore={eventStore}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </EventStoreProvider>
    </AccountsProvider>
  </AppProvider>
)

describe('DraftCard', () => {
  it('renders title', () => {
    render(<DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={vi.fn()} />, { wrapper })
    expect(screen.getByText('My Test Video')).toBeInTheDocument()
  })

  it('renders "Untitled" when no title', () => {
    const draftNoTitle = { ...mockDraft, title: '' }
    render(<DraftCard draft={draftNoTitle} onSelect={vi.fn()} onDelete={vi.fn()} />, { wrapper })
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('renders thumbnail when available', () => {
    render(<DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={vi.fn()} />, { wrapper })
    const img = screen.getByRole('img')
    // Should have img with proxy URL containing the thumbnail URL
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain('http')
  })

  it('proxies an arbitrary (non-Blossom) video URL through the legacy insecure route', () => {
    const draftGeneratedThumb = {
      ...mockDraft,
      thumbnailSource: 'generated' as const,
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    }
    const { container } = render(
      <DraftCard draft={draftGeneratedThumb} onSelect={vi.fn()} onDelete={vi.fn()} />,
      {
        wrapper,
      }
    )

    const img = container.querySelector('img')
    expect(img).toHaveAttribute(
      'src',
      'https://imgproxy.nostu.be/insecure/f:webp/q:82/rs:fit:480:480/plain/http%3A%2F%2Ftest.com%2Fvideo.mp4'
    )
  })

  it('renders placeholder when no thumbnail and no video', () => {
    const draftNoThumb = {
      ...mockDraft,
      thumbnailSource: 'upload' as const,
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      uploadInfo: { videos: [] },
    }
    render(<DraftCard draft={draftNoThumb} onSelect={vi.fn()} onDelete={vi.fn()} />, { wrapper })
    // Should have placeholder div with ImageOff icon
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<DraftCard draft={mockDraft} onSelect={onSelect} onDelete={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByText('My Test Video'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when delete button clicked', () => {
    const onDelete = vi.fn()
    render(<DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={onDelete} />, { wrapper })
    const deleteBtn = screen.getByRole('button')
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('displays video quality info', () => {
    render(<DraftCard draft={mockDraft} onSelect={vi.fn()} onDelete={vi.fn()} />, { wrapper })
    expect(screen.getByText(/1080p • 450 MB/)).toBeInTheDocument()
  })
})
