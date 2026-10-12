import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { finalizeEvent, generateSecretKey, getPublicKey, type NostrEvent } from 'nostr-tools'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processEvent } from '@nostube/core/video-event'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { VideoActions } from './VideoActions'
import type { InstanceClient } from './instance-client'
import './i18n'

const mocks = vi.hoisted(() => ({
  signerState: {} as Record<string, unknown>,
  upload: vi.fn(),
  hash: vi.fn(),
  probe: vi.fn(),
}))
vi.mock('./signer-context', () => ({ useSigner: () => mocks.signerState }))
vi.mock('./upload/make-deps', () => ({
  makeUploadDeps: () => ({ upload: mocks.upload, hash: mocks.hash, probe: mocks.probe }),
}))

const secret = generateSecretKey()
const pubkey = getPublicKey(secret)
const event = finalizeEvent(
  {
    kind: 34235,
    created_at: 200,
    content: 'Description',
    tags: [
      ['d', 'stable'],
      ['title', 'Original'],
      ['published_at', '100'],
      [
        'imeta',
        'url https://media.example/old.mp4',
        'm video/mp4',
        'x oldhash',
        'size 12',
        'dim 640x360',
      ],
    ],
  },
  secret
)
const video = processEvent(event, [])!

function setup(replies = [{ ok: true, from: 'wss://relay', message: '' }], hidden = false) {
  const eventStore = new EventStore()
  // jsdom's TextEncoder realm breaks schnorr verification; not under test here.
  eventStore.verifyEvent = () => true
  eventStore.add(event)
  const publish = vi.fn(async (..._args: [string[], NostrEvent]) => replies)
  const onHiddenChange = vi.fn()
  const instance = {
    client: { eventStore, relayPool: { publish } },
    config: { videoSources: ['wss://relay'] },
  } as unknown as InstanceClient
  render(
    <TooltipProvider>
      <VideoActions
        video={video}
        instance={instance}
        hidden={hidden}
        hideBusy={false}
        onHiddenChange={onHiddenChange}
      />
    </TooltipProvider>
  )
  return { publish, eventStore, onHiddenChange }
}

/** Opens the row's `⋯` menu with the keyboard and answers its item names. */
function openMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'Enter' })
  return screen.getAllByRole('menuitem').map(item => item.textContent)
}
// Its frame slider renders `calc(NaN%)` before video metadata, which jsdom's CSS parser rejects.
// Thumbnail and subtitle handling are covered in run-video-edit.test.ts.
vi.mock('@nostube/widgets/components/ThumbnailSection', () => ({ ThumbnailSection: () => null }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.signerState = {
    pubkey,
    signer: {
      getPublicKey: async () => pubkey,
      signEvent: async (template: Parameters<typeof finalizeEvent>[0]) =>
        finalizeEvent(template, secret),
    },
  }
})

describe('studio video actions', () => {
  it('saves metadata without reuploading video and refreshes the shared store after acceptance', async () => {
    const { publish, eventStore } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit metadata' }))
    expect(screen.getByRole('dialog', { name: 'Edit metadata' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Edited title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save video' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save video' })).toBeNull())
    const latest = eventStore.getReplaceable(34235, pubkey, 'stable')!
    expect(latest.tags).toContainEqual(['title', 'Edited title'])
    expect(latest.tags).toContainEqual(event.tags[3])
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.probe).not.toHaveBeenCalled()
  })

  it('offers replace, hide and delete in the menu and confirms deletion in an alert dialog', () => {
    const { publish } = setup()
    expect(openMenu()).toEqual(['Replace video file', 'Hide on site', 'Delete video'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete video' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(publish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(publish).not.toHaveBeenCalled()
  })

  it('deletes the latest version, not the row’s stale event id', async () => {
    const { publish, eventStore } = setup()
    const latest = finalizeEvent({ ...event, created_at: 2_000_000_000, content: 'Newer' }, secret)
    eventStore.add(latest)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete video' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    const deletion = publish.mock.calls[0][1] as typeof event
    expect(deletion.kind).toBe(5)
    expect(deletion.created_at).toBe(2_000_000_001)
    expect(deletion.tags).toEqual([
      ['e', latest.id],
      ['a', `34235:${pubkey}:stable`],
      ['k', '34235'],
    ])
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('shows relay refusal without removing the video or losing confirmation retry state', async () => {
    const { publish, eventStore } = setup([
      { ok: false, from: 'wss://relay', message: 'blocked: denied' },
    ])
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete video' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await screen.findByText(/blocked: denied/)
    expect(eventStore.getReplaceable(34235, pubkey, 'stable')?.id).toBe(event.id)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2))
  })

  it('hides and shows the video on the site from the menu', () => {
    const { onHiddenChange } = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide on site' }))
    expect(onHiddenChange).toHaveBeenCalledWith(true)
    cleanup()
    const shown = setup(undefined, true)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show on site' }))
    expect(shown.onHiddenChange).toHaveBeenCalledWith(false)
  })

  it('offers only hiding to an administrator signing as another author', () => {
    mocks.signerState = { ...mocks.signerState, pubkey: 'f'.repeat(64) }
    setup()
    expect(screen.queryByRole('button', { name: 'Edit metadata' })).toBeNull()
    expect(openMenu()).toEqual(['Hide on site'])
    expect(screen.getByRole('link', { name: 'View on site' }).getAttribute('href')).toBe(
      `/v/${video.link}`
    )
  })
})
