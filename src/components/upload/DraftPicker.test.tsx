import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DraftPicker } from './DraftPicker'
import type { UploadDraft } from '@/types/upload-draft'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'
import { Toaster } from '@/components/ui/toaster'
import { AppProvider } from '@/components/AppProvider'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { eventStore } from '@/nostr/core'

const mockDrafts: UploadDraft[] = [
  {
    id: 'draft-1',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    title: 'Draft 1',
    description: '',
    tags: [],
    language: 'en',
    people: [],
    contentWarning: { enabled: false, reason: '' },
    expiration: 'none',
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    subtitles: [],
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
    people: [],
    contentWarning: { enabled: false, reason: '' },
    expiration: 'none',
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    subtitles: [],
    thumbnailSource: 'generated',
  },
]

const accountManager = new AccountManager()

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppProvider
    storageKey="test-draft-picker"
    defaultConfig={{
      theme: 'light',
      relays: [],
      videoType: 'videos',
      nsfwFilter: 'warning',
      thumbResizeServerUrl: 'https://almond.slidestr.net',
    }}
  >
    <AccountsProvider manager={accountManager}>
      <EventStoreProvider eventStore={eventStore}>
        <I18nextProvider i18n={i18n}>
          {children}
          <Toaster />
        </I18nextProvider>
      </EventStoreProvider>
    </AccountsProvider>
  </AppProvider>
)

describe('DraftPicker', () => {
  beforeEach(() => {
    // Add required translations
    i18n.addResourceBundle(
      'en',
      'translation',
      {
        common: {
          cancel: 'Cancel',
          deleting: 'Deleting...',
        },
        upload: {
          draft: {
            deleted: 'Draft deleted',
            deletedDescription: 'Draft has been deleted',
            newUpload: 'New Upload',
            yourDrafts: 'Your Drafts ({{count}})',
            deleteDialog: {
              title: 'Delete Draft',
              descriptionNoMedia:
                'Are you sure you want to delete this draft? This action cannot be undone.',
              descriptionWithMedia:
                'This draft has uploaded media files. Do you want to delete just the draft or also remove the media from your Blossom servers?',
              deleteDraftOnly: 'Delete draft only',
              deleteVideoAndThumbnails: 'Delete draft and media files',
            },
          },
        },
      },
      true,
      true
    )
  })

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
    expect(screen.getByRole('button', { name: /New Upload/i })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /New Upload/i }))
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

  it('shows confirmation dialog and deletes draft', async () => {
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

    // Find delete button (first one - has trash icon)
    const deleteButtons = screen.getAllByRole('button')
    const firstDeleteBtn = deleteButtons.find(btn => btn.querySelector('svg.lucide-trash-2'))

    expect(firstDeleteBtn).toBeTruthy()
    if (firstDeleteBtn) {
      fireEvent.click(firstDeleteBtn)

      // Wait for the confirmation dialog to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Draft')).toBeInTheDocument()
      })

      // Click "Delete draft only" button in dialog
      const deleteDraftOnlyBtn = screen.getByText('Delete draft only')
      fireEvent.click(deleteDraftOnlyBtn)

      // Verify onDeleteDraft was called
      await waitFor(() => {
        expect(onDeleteDraft).toHaveBeenCalledWith('draft-1')
      })

      // Verify toast appears
      await waitFor(() => {
        expect(screen.getByText('Draft deleted')).toBeInTheDocument()
      })
    }
  })
})
