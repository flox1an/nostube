import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DraftPicker } from './DraftPicker'
import type { UploadDraft } from '@/types/upload-draft'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'

const mockDrafts: UploadDraft[] = [
  {
    id: 'draft-1',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    title: 'Draft 1',
    description: '',
    tags: [],
    language: 'en',
    contentWarning: { enabled: false, reason: '' },
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    thumbnailSource: 'generated',
  },
  {
    id: 'draft-2',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
    title: 'Draft 2',
    description: '',
    tags: [],
    language: 'en',
    contentWarning: { enabled: false, reason: '' },
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    thumbnailSource: 'generated',
  },
]

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

describe('DraftPicker', () => {
  it('renders "New Upload" button', () => {
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getByText('New Upload')).toBeInTheDocument()
  })

  it('displays correct draft count', () => {
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getByText('Your Drafts (2)')).toBeInTheDocument()
  })

  it('renders all draft cards', () => {
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    expect(screen.getByText('Draft 1')).toBeInTheDocument()
    expect(screen.getByText('Draft 2')).toBeInTheDocument()
  })

  it('calls onNewUpload when New Upload clicked', () => {
    const onNewUpload = vi.fn()
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={onNewUpload}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('New Upload'))
    expect(onNewUpload).toHaveBeenCalledTimes(1)
  })

  it('calls onSelectDraft when draft card clicked', () => {
    const onSelectDraft = vi.fn()
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={onSelectDraft}
        onNewUpload={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Draft 1'))
    expect(onSelectDraft).toHaveBeenCalledWith(mockDrafts[0])
  })

  it('shows undo toast on delete', async () => {
    const onDeleteDraft = vi.fn()
    render(
      <DraftPicker
        drafts={mockDrafts}
        onSelectDraft={vi.fn()}
        onNewUpload={vi.fn()}
        onDeleteDraft={onDeleteDraft}
      />,
      { wrapper }
    )

    // Find delete button (first one)
    const deleteButtons = screen.getAllByRole('button')
    const firstDeleteBtn = deleteButtons.find(btn => btn.querySelector('svg'))

    if (firstDeleteBtn) {
      fireEvent.click(firstDeleteBtn)
      await waitFor(() => {
        expect(screen.getByText('Draft deleted')).toBeInTheDocument()
      })
    }
  })
})
