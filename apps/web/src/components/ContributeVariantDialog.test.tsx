import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ContributeVariantDialog } from './ContributeVariantDialog'
import type { VideoEvent } from '@/utils/video-event'
import type { BlossomServer } from '@/contexts/AppContext'
import { AppProvider } from '@/components/AppProvider'
import type { AppConfig } from '@/contexts/AppContext'

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: 'pubkey',
      signer: { signEvent: vi.fn(async event => event) },
    },
  }),
}))

const start = vi.fn()
const reset = vi.fn()
const cancel = vi.fn()

vi.mock('@/hooks/useContributeVariant', () => ({
  useContributeVariant: () => ({
    status: 'idle',
    downloadProgress: undefined,
    variantProgress: [],
    results: [],
    error: undefined,
    start,
    reset,
    cancel,
  }),
}))

vi.mock('./video-upload/TranscodeVariantPicker', () => ({
  TranscodeVariantPicker: ({ sourceMeta }: { sourceMeta: { sizeMB: number } }) => (
    <div data-testid="variant-picker">{sourceMeta.sizeMB.toFixed(1)} MB source</div>
  ),
}))

const videoEvent = {
  id: 'event-id',
  kind: 21,
  pubkey: 'pubkey',
  created_at: 1,
  content: '',
  tags: [],
  sig: 'sig',
}

function makeVideo(overrides: Partial<VideoEvent> = {}): VideoEvent {
  return {
    id: 'event-id',
    kind: 21,
    identifier: undefined,
    title: 'How The State Makes Us Poorer',
    description: '',
    images: ['https://cdn.example.com/fallback.jpg'],
    pubkey: 'pubkey',
    created_at: 1,
    duration: 100,
    tags: [],
    searchText: '',
    urls: ['https://cdn.example.com/source.mp4'],
    mimeType: 'video/mp4',
    mediaType: 'video',
    dimensions: '1920x1080',
    link: '/v/event-id',
    type: 'videos',
    textTracks: [],
    contentWarning: undefined,
    origins: [],
    videoVariants: [],
    thumbnailVariants: [
      {
        url: 'https://cdn.example.com/thumb.jpg',
        fallbackUrls: [],
        mediaType: 'image',
      },
    ],
    allVideoVariants: [
      {
        url: 'https://cdn.example.com/source.mp4',
        dimensions: '1920x1080',
        mimeType: 'video/mp4; codecs="avc1.640028"',
        quality: '1080p',
        fallbackUrls: [],
      },
    ],
    ...overrides,
  }
}

let renderCounter = 0
function renderDialog(video = makeVideo(), opts: { blossomServers?: BlossomServer[] } = {}) {
  // Use a unique storage key per render so useLocalStorage doesn't bleed
  // state between tests (the source-preview tests reuse the same key).
  const storageKey = `test-contribute-config-${++renderCounter}`
  const defaultConfig: AppConfig = {
    theme: 'light',
    relays: [{ url: 'wss://relay.test', name: 'relay.test', tags: ['read', 'write'] }],
    videoType: 'videos',
    nsfwFilter: 'warning',
    blossomServers: opts.blossomServers ?? [],
  }
  return render(
    <MemoryRouter>
      <AppProvider storageKey={storageKey} defaultConfig={defaultConfig}>
        <ContributeVariantDialog
          open
          onOpenChange={vi.fn()}
          video={video}
          videoEvent={videoEvent}
        />
      </AppProvider>
    </MemoryRouter>
  )
}

describe('ContributeVariantDialog source preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn(async () => ({ supported: true })),
    })
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(async () => ({ supported: true })),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(null, { headers: { 'Content-Length': String(10 * 1024 * 1024) } })
      )
    )
  })

  it('uses the video thumbnail for the source preview', async () => {
    renderDialog()

    const preview = await screen.findByRole('img', {
      name: 'How The State Makes Us Poorer source thumbnail',
    })

    expect(preview).toHaveAttribute('src', 'https://cdn.example.com/thumb.jpg')
  })

  it('shows source resolution, codec, and size from a HEAD lookup', async () => {
    renderDialog()

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        'https://cdn.example.com/source.mp4',
        expect.objectContaining({ method: 'HEAD' })
      )
    )
    expect(
      await screen.findByText('10.0 MB · 1920x1080 · avc1.640028 · video/mp4')
    ).toBeInTheDocument()
    expect(screen.getByTestId('variant-picker')).toHaveTextContent('10.0 MB source')
  })
})

describe('ContributeVariantDialog inline server add', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn(async () => ({ supported: true })),
    })
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(async () => ({ supported: true })),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(null, { headers: { 'Content-Length': String(10 * 1024 * 1024) } })
      )
    )
  })

  it('renders the inline add-server input and settings link', async () => {
    renderDialog()
    expect(await screen.findByPlaceholderText(/Add server URL/i)).toBeInTheDocument()
    expect(await screen.findByText(/Manage in settings/i)).toBeInTheDocument()
  })

  it('adds a new blossom server to config and auto-selects it', async () => {
    renderDialog(makeVideo(), {
      blossomServers: [{ url: 'https://existing.example', name: 'existing', tags: [] }],
    })

    // Existing server is rendered with a checkbox
    expect(await screen.findByText('existing.example')).toBeInTheDocument()

    // Add a new server via the inline input + button
    const input = await screen.findByPlaceholderText(/Add server URL/i)
    fireEvent.change(input, { target: { value: 'blossom.primal.net' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/i }))

    // New server appears and is auto-selected (checkbox checked)
    expect(await screen.findByText('blossom.primal.net')).toBeInTheDocument()
    const newCheckbox = screen
      .getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent?.includes('blossom.primal.net'))
    expect(newCheckbox).toBeChecked()
  })

  it('rejects a duplicate URL with an inline error', async () => {
    renderDialog(makeVideo(), {
      blossomServers: [{ url: 'https://existing.example', name: 'existing', tags: [] }],
    })

    const input = await screen.findByPlaceholderText(/Add server URL/i)
    fireEvent.change(input, { target: { value: 'existing.example' } })
    fireEvent.click(screen.getByRole('button', { name: /Add/i }))

    expect(await screen.findByText(/already in list/i)).toBeInTheDocument()
  })
})
