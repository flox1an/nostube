import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS } from '@nostube/core/instance-config'
import type { AdminState } from './api'
import { bootInstanceClient } from './instance-client'
import { SignerProvider } from './signer-context'
import UploadPage from './UploadPage'
import { uploadBlob } from './upload/blossom-upload'
import './i18n'

// The browser parts (decoding a video, hashing, the network) are replaced; the page, the signer
// and the pipeline between them are the real ones.
vi.mock('./upload/probe-video', async importOriginal => ({
  ...(await importOriginal<typeof import('./upload/probe-video')>()),
  probeVideo: vi.fn(async () => ({
    width: 640,
    height: 360,
    duration: 3,
    thumbnail: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })),
}))
vi.mock('./upload/sha256-file', () => ({ sha256File: vi.fn(async () => 'a'.repeat(64)) }))
vi.mock('./upload/blossom-upload', () => ({
  uploadBlob: vi.fn(async ({ sha256, type }: { sha256: string; type: string }) => ({
    url: `https://videos.example.org/${sha256}`,
    sha256,
    size: 5,
    type,
  })),
}))
vi.mock('./instance-client', () => ({
  bootInstanceClient: vi.fn(async () => ({
    config: { videoSources: ['wss://videos.example.org'] },
    client: {
      relayPool: { publish: vi.fn(async () => [{ ok: true, from: 'wss://videos.example.org' }]) },
    },
  })),
}))

const secret = generateSecretKey()
const pubkey = getPublicKey(secret)

const stateFor = (creators: string[], writers: string[]): AdminState => ({
  revision: 1,
  origin: 'https://videos.example.org',
  tls: 'proxy',
  tlsMode: 'proxy',
  bootId: 'b',
  nostrPubkey: null,
  config: {
    title: 'T',
    creators,
    allowedWriters: writers,
    videoSources: ['wss://videos.example.org'],
    interactionRelays: [],
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
    site: {
      tagline: '',
      theme: { accent: '#6d28d9', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
    },
  },
})

async function renderPage(state: AdminState) {
  render(
    <SignerProvider>
      <UploadPage state={state} banner={null} />
    </SignerProvider>
  )
  const input = (await screen.findByLabelText('Video file')) as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File(['video'], 'my_clip.mp4', { type: 'video/mp4' })] },
  })
  await screen.findByText(/640×360/)
}

beforeEach(() => {
  ;(window as unknown as { nostr: object }).nostr = {
    getPublicKey: async () => pubkey,
    signEvent: async (template: EventTemplate) =>
      JSON.parse(JSON.stringify(finalizeEvent(template, secret))),
  }
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  delete (window as unknown as { nostr?: object }).nostr
  vi.clearAllMocks()
})

describe('UploadPage', () => {
  it('does not upload or sign while selecting a video', async () => {
    const signEvent = vi.fn(async (template: EventTemplate) => finalizeEvent(template, secret))
    // jsdom's Window has no NIP-07 extension declaration; install the test extension explicitly.
    const extensionWindow = window as unknown as { nostr: object }
    extensionWindow.nostr = { getPublicKey: async () => pubkey, signEvent }
    await renderPage(stateFor([pubkey], [pubkey]))
    expect(uploadBlob).not.toHaveBeenCalled()
    expect(signEvent).not.toHaveBeenCalled()
  })
  it('publishes on the very first click, before the page has seen the key', async () => {
    await renderPage(stateFor([pubkey], [pubkey]))
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('my clip')
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByText('Published', {}, { timeout: 4000 })
    expect(screen.queryByText(/not ready/i)).toBeNull()
    expect(uploadBlob).toHaveBeenCalledTimes(2) // the video and its thumbnail
    expect(screen.getByRole('link', { name: /\/v\/naddr1/ })).toBeTruthy()
    expect(screen.getByText(/relay only/)).toBeTruthy()
  })

  it('does not upload for a key that is no creator and writer of the instance', async () => {
    await renderPage(stateFor([], []))
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByText(/not yet a creator and uploader/)
    expect(uploadBlob).not.toHaveBeenCalled()
  })

  it('shows the relay’s own reason when no relay takes the video', async () => {
    vi.mocked(bootInstanceClient).mockResolvedValueOnce({
      config: { videoSources: ['wss://videos.example.org'] },
      client: {
        relayPool: {
          publish: vi.fn(async () => [
            { ok: false, from: 'wss://videos.example.org', message: 'blocked: not a writer' },
          ]),
        },
      },
    } as never)
    await renderPage(stateFor([pubkey], [pubkey]))
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByText(/blocked: not a writer/, {}, { timeout: 4000 })
    expect(screen.queryByText('Published')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  })
})
