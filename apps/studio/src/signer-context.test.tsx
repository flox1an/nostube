import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processEvent } from '@nostube/core/video-event'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import type { SignerInfo } from './api'
import type { InstanceClient } from './instance-client'
import { SignerProvider, useSigner, type SignerState } from './signer-context'
import { logInWithExtension, logOut, type TestExtension } from './test-account'
import { VideoActions } from './VideoActions'
import i18n from './i18n'

vi.mock('./accounts', async importOriginal => ({
  ...(await importOriginal<typeof import('./accounts')>()),
  loadAccounts: async () => [],
}))

const MANAGED = 'b'.repeat(64)
const secret = generateSecretKey()
const OWN = getPublicKey(secret)

const json = (body: unknown) => new Response(JSON.stringify(body))

/** The server's signer endpoints; `info` is what `GET /api/admin/signer` reports. */
function serve(info: SignerInfo) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/signer' && init?.method === 'POST') {
      return json({ mode: 'managed', pubkey: MANAGED })
    }
    if (url === '/api/admin/signer') return json(info)
    if (url === '/api/admin/signer/sign') {
      return json({ ...JSON.parse(String(init?.body)), id: 'i', pubkey: MANAGED, sig: 's' })
    }
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

let extension: TestExtension

beforeEach(async () => {
  await i18n.changeLanguage('en')
  extension = logInWithExtension(secret)
})
afterEach(() => {
  logOut()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SignerProvider', () => {
  let current: SignerState
  function Probe() {
    current = useSigner()
    return null
  }

  it('signs on the server when it holds the managed key, not with the extension', async () => {
    const fetch = serve({ mode: 'managed', pubkey: MANAGED })
    render(
      <SignerProvider creatorKey={null}>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(current.mode).toBe('managed')
    // Known without a prompt: nothing to connect.
    expect(current.pubkey).toBe(MANAGED)
    const event = { kind: 1, created_at: 1, tags: [], content: 'hi', pubkey: 'stale' }
    const signed = await current.signer!.signEvent(event)
    expect(signed.pubkey).toBe(MANAGED)
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/admin/signer/sign')!
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: 1,
      created_at: 1,
      tags: [],
      content: 'hi',
    })
    expect(extension.signEvent).not.toHaveBeenCalled()
  })

  it('knows the creator key in own identity without asking the extension', async () => {
    serve({ mode: 'own', pubkey: null })
    render(
      <SignerProvider creatorKey={OWN}>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(current.pubkey).toBe(OWN)
    expect(extension.getPublicKey).not.toHaveBeenCalled()
  })

  it('has no signer in own identity until a Nostr account is logged in here', async () => {
    logOut()
    serve({ mode: 'own', pubkey: null })
    render(
      <SignerProvider creatorKey={OWN}>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.status).toBe('none'))
    expect(current.signer).toBeNull()
    logInWithExtension(secret)
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(current.signer).not.toBeNull()
  })

  it('shows why when the server cannot tell where the key is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'key locked' }), { status: 500 }))
    )
    render(
      <SignerProvider creatorKey={null}>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.error).toBe('key locked'))
    expect(current.signer).toBeNull()
  })
})

describe('video actions without a connect step', () => {
  const secret = generateSecretKey()
  const creator = getPublicKey(secret)
  const video = processEvent(
    finalizeEvent(
      {
        kind: 34235,
        created_at: 200,
        content: '',
        tags: [
          ['d', 'clip'],
          ['title', 'Clip'],
          ['imeta', 'url https://media.example/clip.mp4', 'm video/mp4'],
        ],
      },
      secret
    ),
    []
  )!

  it.each([
    ['own', { mode: 'own', pubkey: null }],
    ['channel', { mode: 'managed', pubkey: creator }],
  ] as const)('offers edit, replace and delete at once in %s identity', async (_, info) => {
    serve(info)
    render(
      <SignerProvider creatorKey={creator}>
        <TooltipProvider>
          <VideoActions
            video={video}
            instance={{} as InstanceClient}
            hidden={false}
            hideBusy={false}
            onHiddenChange={() => {}}
          />
        </TooltipProvider>
      </SignerProvider>
    )
    expect(await screen.findByRole('button', { name: 'Edit metadata' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Replace video file' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Delete video' })).toBeTruthy()
    expect(extension.getPublicKey).not.toHaveBeenCalled()
  })
})
