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
    contentWarning: { enabled: false, reason: '' },
    expiration: 'none',
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
    expiration: 'none',
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
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
        upload: {
          draft: {
            deleted: 'Draft deleted',
            deletedDescription: 'Draft was deleted',
            undo: 'Undo',
            newUpload: 'New Upload',
            yourDrafts: 'Your Drafts ({{count}})',
            untitled: 'Untitled',
            addVideoToStart: 'Add video to start',
            deleteDialog: {
              title: 'Delete Draft',
              descriptionWithMedia: 'This draft has uploaded media files.',
              descriptionNoMedia: 'This will permanently delete this draft.',
              deleteDraftOnly: 'Delete draft only',
              deleteVideoAndThumbnails: 'Delete draft and files',
            },
          },
        },
        common: {
          cancel: 'Cancel',
          deleting: 'Deleting...',
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
    // Button text is split: "+ " and "New Upload" are separate text nodes
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
    // Button text is split: "+ " and "New Upload" are separate text nodes
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

  it('shows delete confirmation dialog on delete', async () => {
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

    // Find delete button by looking for the trash icon (lucide-trash2 class)
    const deleteButtons = screen.getAllByRole('button')
    const firstDeleteBtn = deleteButtons.find(
      btn => btn.querySelector('svg.lucide-trash-2') || btn.querySelector('svg.lucide-trash2')
    )

    expect(firstDeleteBtn).toBeTruthy()
    if (firstDeleteBtn) {
      fireEvent.click(firstDeleteBtn)
      // The new flow shows a confirmation dialog with alertdialog role
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
    }
  })
})
