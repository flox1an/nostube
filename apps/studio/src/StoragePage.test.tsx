import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  DEFAULT_SIGNER_RELAYS,
  DEFAULT_SITE_LINKS,
  noSitePages,
} from '@nostube/core/instance-config'
import type { AdminState, StorageStatus, StorageTestResult } from './api'
import { toDraft } from './draft'
import i18n from './i18n'
import { StoragePage } from './StoragePage'

const state = (canBePublic: boolean): AdminState => ({
  revision: 1,
  origin: 'https://videos.example.org',
  tls: 'proxy',
  tlsMode: 'proxy',
  bootId: 'b1',
  nostrPubkey: null,
  originIsPublic: canBePublic,
  canBePublic,
  branding: { logo: null, favicon: null, banner: null, icon: null },
  config: {
    title: 'My videos',
    creators: ['a'.repeat(64)],
    allowedWriters: [],
    videoSources: ['wss://videos.example.org'],
    interactionRelays: ['wss://videos.example.org'],
    profileRelays: DEFAULT_PROFILE_RELAYS,
    signerRelays: DEFAULT_SIGNER_RELAYS,
    reach: 'private',
    siteHosting: 'instance',
    nsite: { gateway: 'nsite.lol', domain: '' },
    mirror: { relays: ['wss://mirror.example'], blossom: [] },
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
})

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('S3 storage', () => {
  const s3 = {
    endpoint: 'https://acc.r2.cloudflarestorage.com',
    bucket: 'videos',
    region: 'auto',
    forcePathStyle: false,
    accessKeyId: 'AKID',
    secretSet: true,
  }
  const up = { available: true, lastError: null, lastAttempt: null }
  const status = (
    s3Status: StorageStatus['s3'],
    move: Partial<StorageStatus['move']> = {}
  ): StorageStatus => ({
    s3: s3Status,
    move: {
      state: 'idle',
      filesDone: 0,
      filesTotal: 0,
      bytesDone: 0,
      bytesTotal: 0,
      error: null,
      localFiles: 0,
      localBytes: 0,
      ...move,
    },
  })
  const enabled = () => {
    const s = state(true)
    s.config.storage.s3 = { ...s3 }
    return s
  }

  const serve = (
    storage: () => StorageStatus,
    probe: () => StorageTestResult = () => ({ ok: true })
  ) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url === '/api/admin/storage'
                ? storage()
                : url === '/api/admin/storage/test'
                  ? probe()
                  : {}
            )
          )
      )
    )
  /** The JSON bodies POSTed to `path`. */
  const sent = (path: string) =>
    vi
      .mocked(fetch)
      .mock.calls.filter(([url, init]) => url === path && init?.method === 'POST')
      .map(([, init]) => JSON.parse(init!.body as string))

  /** The page with a draft that follows its edits, as the studio holds it. */
  function Harness({ s }: { s: AdminState }) {
    const [draft, setDraft] = useState(() => toDraft(s.config))
    return (
      <StoragePage draft={draft} update={patch => setDraft(d => ({ ...d, ...patch }))} state={s} />
    )
  }
  const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
  const s3Tile = () => screen.getByRole('button', { name: /^S3-compatible storage/ })
  const moveButton = () => screen.queryByRole('button', { name: 'Move existing files to S3' })

  it('labels the quota as covering local and S3 and keeps S3 an opt-in choice', () => {
    serve(() => status(null))
    render(<Harness s={state(true)} />)
    expect(
      screen.getByText('Counts files on this machine and in S3 together. 0 means unlimited.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /^This machine/ }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    expect(screen.queryByLabelText('Endpoint')).toBeNull()
    fireEvent.click(s3Tile())
    expect(s3Tile().getAttribute('aria-pressed')).toBe('true')
    expect(input('Endpoint').value).toBe('')
    expect(input('Region').placeholder).toBe('auto')
    expect(input('Secret access key').type).toBe('password')
    expect(screen.getByText(/^Write-only/)).toBeTruthy()
  })

  it('checks the form before testing the connection', () => {
    serve(() => status(null))
    render(<Harness s={state(true)} />)
    fireEvent.click(s3Tile())
    fireEvent.change(input('Endpoint'), { target: { value: 'minio.lan:9000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    for (const message of [
      'Enter the S3 endpoint as an http:// or https:// address.',
      'Enter the bucket name.',
      'Enter the access key ID.',
      'Enter the secret access key.',
    ]) {
      expect(screen.getByText(message), message).toBeTruthy()
    }
    expect(sent('/api/admin/storage/test')).toEqual([])
  })

  it('tests the typed settings and shows success, or the failing step with the provider error', async () => {
    let probe: StorageTestResult = { ok: true }
    serve(
      () => status(null),
      () => probe
    )
    render(<Harness s={state(true)} />)
    fireEvent.click(s3Tile())
    fireEvent.change(input('Endpoint'), { target: { value: 'http://minio.lan:9000' } })
    fireEvent.change(input('Bucket'), { target: { value: 'videos' } })
    fireEvent.change(input('Access key ID'), { target: { value: 'AKID' } })
    fireEvent.change(input('Secret access key'), { target: { value: 'shh' } })
    fireEvent.click(input('Path-style addressing'))
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/^Connection works/)).toBeTruthy()
    expect(sent('/api/admin/storage/test')).toEqual([
      {
        endpoint: 'http://minio.lan:9000',
        bucket: 'videos',
        region: 'auto',
        forcePathStyle: true,
        accessKeyId: 'AKID',
        secretSet: false,
        secretAccessKey: 'shh',
      },
    ])

    probe = { ok: false, step: 'list', error: 'AccessDenied: Access Denied' }
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    const failure = 'Failed at step “list the bucket”: AccessDenied: Access Denied'
    expect(await screen.findByText(failure)).toBeTruthy()
    expect(screen.queryByText(/^Connection works/)).toBeNull()
    // The result belongs to the values tested.
    fireEvent.change(input('Bucket'), { target: { value: 'other' } })
    expect(screen.queryByText(failure)).toBeNull()
  })

  it('keeps the secret write-only: shown as set, never filled in, sent only when typed', async () => {
    serve(() => status(up))
    render(<Harness s={enabled()} />)
    const secret = input('Secret access key')
    expect(secret.type).toBe('password')
    expect(secret.value).toBe('')
    expect(screen.getByText('Set. Leave empty to keep the stored secret.')).toBeTruthy()
    // Turning S3 off again is not offered.
    expect(
      (screen.getByRole('button', { name: /^This machine/ }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(screen.getByText(/cannot be turned off/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/^Connection works/)).toBeTruthy()
    expect(sent('/api/admin/storage/test')).toEqual([s3])
  })

  it('warns while the bucket is unavailable, with the error and a link to the settings', async () => {
    serve(() =>
      status({
        available: false,
        lastError: 'dispatch failure: connection refused',
        lastAttempt: 1700000000,
      })
    )
    render(<Harness s={enabled()} />)
    expect(await screen.findByText('S3 storage is unavailable')).toBeTruthy()
    expect(screen.getByText('dispatch failure: connection refused')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Correct the S3 settings' })
    expect(link.getAttribute('href')).toBe('#/storage')
    fireEvent.click(link)
    expect(document.activeElement).toBe(input('Endpoint'))
    location.hash = ''
  })

  it('starts the move and polls its progress until it finishes', async () => {
    vi.useFakeTimers()
    const MB = 1024 * 1024
    let current = status(up, { localFiles: 3, localBytes: 3 * MB })
    serve(() => current)
    await act(async () => {
      render(<Harness s={enabled()} />)
    })
    expect(screen.queryByText('S3 storage is unavailable')).toBeNull()
    expect(screen.getByText(/^Still stored here: 3 files/)).toBeTruthy()

    current = status(up, {
      state: 'running',
      filesDone: 1,
      filesTotal: 3,
      bytesDone: MB,
      bytesTotal: 3 * MB,
      localFiles: 2,
      localBytes: 2 * MB,
    })
    await act(async () => {
      fireEvent.click(moveButton()!)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(sent('/api/admin/storage/move')).toEqual([{}])
    expect(screen.getByText(/^Moving to S3: 1 of 3 files/)).toBeTruthy()
    expect(moveButton()).toBeNull()

    current = status(up, {
      state: 'completed',
      filesDone: 3,
      filesTotal: 3,
      bytesDone: 3 * MB,
      bytesTotal: 3 * MB,
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(screen.getByText(/^Move finished: 3 files/)).toBeTruthy()
    expect(screen.queryByText(/^Moving to S3/)).toBeNull()
    expect(moveButton()).toBeNull()
  })

  it('does not offer the move while S3 is off', async () => {
    serve(() => status(null, { localFiles: 5, localBytes: 5000 }))
    render(<Harness s={state(true)} />)
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/admin/storage')).toBe(true)
    )
    await act(async () => {})
    expect(moveButton()).toBeNull()
    expect(screen.queryByText(/Still stored here/)).toBeNull()
  })
})
