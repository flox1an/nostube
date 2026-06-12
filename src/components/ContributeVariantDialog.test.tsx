import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContributeVariantDialog } from './ContributeVariantDialog'
import type { VideoEvent } from '@/utils/video-event'

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

function renderDialog(video = makeVideo()) {
  return render(
    <ContributeVariantDialog
      open
      onOpenChange={vi.fn()}
      video={video}
      videoEvent={videoEvent}
      blossomServers={[]}
    />
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
      vi.fn(async () => new Response(null, { headers: { 'Content-Length': String(10 * 1024 * 1024) } }))
    )
  })

  it('uses the video thumbnail for the source preview', async () => {
    renderDialog()

    const preview = await screen.findByRole('img', { name: 'How The State Makes Us Poorer source thumbnail' })

    expect(preview).toHaveAttribute('src', 'https://cdn.example.com/thumb.jpg')
  })

  it('shows source resolution, codec, and size from a HEAD lookup', async () => {
    renderDialog()

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/source.mp4', expect.objectContaining({ method: 'HEAD' }))
    )
    expect(await screen.findByText('10.0 MB · 1920x1080 · avc1.640028 · video/mp4')).toBeInTheDocument()
    expect(screen.getByTestId('variant-picker')).toHaveTextContent('10.0 MB source')
  })
})
