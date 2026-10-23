import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import type { AdminState } from './api'
import { fromLocalInput, toLocalInput } from './datetime'
import { bootInstanceClient } from './instance-client'
import { SignerProvider } from './signer-context'
import { installExtension, logInWithExtension, logOut } from './test-account'
import UploadPage from './UploadPage'
import { uploadBlob } from './upload/blossom-upload'
import './i18n'

// The browser parts (decoding a video, hashing, the network) are replaced; the page, the signer
// and the pipeline between them are the real ones.
vi.mock('./upload/probe-video', async importOriginal => {
  const probe = {
    width: 640,
    height: 360,
    duration: 3,
    thumbnail: new Blob(['jpeg'], { type: 'image/jpeg' }),
  }
  return {
    ...(await importOriginal<typeof import('./upload/probe-video')>()),
    probeVideo: vi.fn(async () => probe),
    inspectVideo: vi.fn(async () => ({ probe })),
  }
})
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

const stateFor = (
  creators: string[],
  writers: string[],
  mirrorRelays: string[] = []
): AdminState => ({
  revision: 1,
  origin: 'https://videos.example.org',
  tls: 'proxy',
  tlsMode: 'proxy',
  bootId: 'b',
  nostrPubkey: null,
  canBePublic: true,
  originIsPublic: true,
  config: {
    title: 'T',
    creators,
    allowedWriters: writers,
    videoSources: ['wss://videos.example.org'],
    interactionRelays: [],
    profileRelays: [],
    reach: 'private',
    siteHosting: 'instance',
    nsite: { gateway: 'nsite.lol', domain: '' },
    mirror: { relays: mirrorRelays, blossom: [] },
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5, s3: null },
    site: {
      tagline: '',
      theme: { accent: '#6d28d9', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
      pages: noSitePages(),
    },
  },
  branding: { logo: null, favicon: null, banner: null, icon: null },
})

async function renderPage(state: AdminState) {
  render(
    <SignerProvider creatorKey={state.config.creators[0] ?? null}>
      <UploadPage state={state} />
    </SignerProvider>
  )
  const input = (await screen.findByLabelText('Video file')) as HTMLInputElement
  fireEvent.change(input, {
    target: { files: [new File(['video'], 'my_clip.mp4', { type: 'video/mp4' })] },
  })
  await screen.findByText(/640×360/)
}

beforeEach(() => {
  logInWithExtension(secret)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  // The server reports an own key, so the provider signs with the logged-in account above.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ mode: 'own', pubkey: null })))
  )
})
afterEach(() => {
  logOut()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('UploadPage', () => {
  it('does not upload or sign while selecting a video', async () => {
    const { signEvent } = installExtension(secret)
    await renderPage(stateFor([pubkey], [pubkey]))
    expect(uploadBlob).not.toHaveBeenCalled()
    expect(signEvent).not.toHaveBeenCalled()
  })
  it('publishes on the first click over HTTP without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    await renderPage(stateFor([pubkey], [pubkey]))
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('my clip')
    // An extension signs here, so it will ask; the managed key would not.
    expect(screen.getByText(/approve the upload/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByText('Published', {}, { timeout: 4000 })
    expect(screen.queryByText(/not ready/i)).toBeNull()
    expect(uploadBlob).toHaveBeenCalledTimes(2) // the video and its thumbnail
    const view = screen.getByRole('link', { name: 'View on the site' })
    expect(view.getAttribute('href')).toMatch(/\/v\/naddr1/)
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('#/videos')
    expect(screen.getByText('my clip')).toBeTruthy()
    expect(screen.getByText(/not copied to other relays/)).toBeTruthy()
  })

  it('says the video is copied on when mirror relays are configured', async () => {
    await renderPage(stateFor([pubkey], [pubkey], ['wss://a.example', 'wss://b.example']))
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByText(/copied to 2 other relays in the background/, {}, { timeout: 4000 })
  })

  it('clears the form for the next video after Upload another', async () => {
    await renderPage(stateFor([pubkey], [pubkey]))
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByRole('button', { name: 'Upload another' }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: 'Upload another' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Upload another' })).toBeNull()
    })
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('')
  })

  it('names what is missing next to the disabled button', async () => {
    render(
      <SignerProvider creatorKey={pubkey}>
        <UploadPage state={stateFor([pubkey], [pubkey])} />
      </SignerProvider>
    )
    expect(await screen.findByText('Choose a video file first.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Video file'), {
      target: { files: [new File(['video'], 'my_clip.mp4', { type: 'video/mp4' })] },
    })
    await screen.findByText(/640×360/)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' ' } })
    expect(screen.getByText('Add a title.')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Upload and publish' }) as HTMLButtonElement).disabled
    ).toBe(true)
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
    await screen.findByText(
      'No relay accepted the video. blocked: not a writer',
      {},
      { timeout: 4000 }
    )
    expect(screen.getByText('wss://videos.example.org: blocked: not a writer')).toBeTruthy()
    // No subtitles were chosen: that step did nothing.
    expect(screen.getByText('skipped')).toBeTruthy()
    expect(screen.queryByText('Published')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy())
  })

  it('gives advice instead of the raw error when the relay cannot be reached', async () => {
    vi.mocked(bootInstanceClient).mockResolvedValueOnce({
      config: { videoSources: ['wss://videos.example.org'] },
      client: {
        relayPool: {
          publish: vi.fn(async () => [
            { ok: false, from: 'wss://videos.example.org', message: 'Unknown error' },
          ]),
        },
      },
    } as never)
    await renderPage(stateFor([pubkey], [pubkey]))
    fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }))
    await screen.findByText(
      /could not be reached. Check the instance address/,
      {},
      { timeout: 4000 }
    )
    expect(screen.getByText('wss://videos.example.org: Unknown error')).toBeTruthy()
  })

  describe('with a publish date', () => {
    const stubFetch = () => {
      const fetchMock = vi.fn(
        async (url: string, _init?: RequestInit) =>
          new Response(
            JSON.stringify(
              url === '/api/admin/schedule' ? { id: 'x', dueAt: 1 } : { mode: 'own', pubkey: null }
            )
          )
      )
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }
    const inSeconds = (seconds: number) => Math.floor(Date.now() / 1000) + seconds

    it('hands the signed event to the server instead of publishing it', async () => {
      const fetchMock = stubFetch()
      await renderPage(stateFor([pubkey], [pubkey]))
      const local = toLocalInput(inSeconds(86400))
      fireEvent.change(screen.getByLabelText('Publish on'), { target: { value: local } })
      fireEvent.click(screen.getByRole('button', { name: 'Upload and schedule' }))
      await screen.findByText('Scheduled', {}, { timeout: 4000 })
      const sent = fetchMock.mock.calls.find(([url]) => url === '/api/admin/schedule')
      const signed = JSON.parse(String(sent?.[1]?.body))
      expect(verifyEvent(signed)).toBe(true)
      expect(signed.pubkey).toBe(pubkey)
      expect(signed.tags).toContainEqual(['published_at', String(fromLocalInput(local))])
      // Signed now (relays refuse a future created_at); only published_at carries the date.
      expect(Math.abs(signed.created_at - inSeconds(0))).toBeLessThan(60)
      expect(bootInstanceClient).not.toHaveBeenCalled()
    })

    it('does not start for a date that has passed', async () => {
      stubFetch()
      await renderPage(stateFor([pubkey], [pubkey]))
      fireEvent.change(screen.getByLabelText('Publish on'), {
        target: { value: toLocalInput(inSeconds(-3600)) },
      })
      expect(screen.getByText('Choose a date and time in the future.')).toBeTruthy()
      expect(
        (screen.getByRole('button', { name: 'Upload and schedule' }) as HTMLButtonElement).disabled
      ).toBe(true)
    })
  })
})
