import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraftCard } from './DraftCard'
import type { UploadDraft } from '@/types/upload-draft'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'

const mockDraft: UploadDraft = {
  id: 'test-id',
  createdAt: Date.now() - 2 * 3600000, // 2 hours ago
  updatedAt: Date.now() - 2 * 3600000,
  title: 'My Test Video',
  description: 'Test description',
  tags: ['test'],
  language: 'en',
  contentWarning: { enabled: false, reason: '' },
  inputMethod: 'file',
  uploadInfo: {
    videos: [
      {
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
  thumbnailSource: 'generated',
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
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
    expect(img).toHaveAttribute('src', 'http://test.com/thumb.jpg')
  })

  it('renders placeholder when no thumbnail', () => {
    const draftNoThumb = {
      ...mockDraft,
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
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
