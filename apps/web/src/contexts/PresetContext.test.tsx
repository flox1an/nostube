import { act, cleanup, render, screen } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { Subject } from 'rxjs'
import type { NostrEvent } from 'nostr-tools'
import type * as Loaders from 'applesauce-loaders/loaders'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESET_PUBKEY, EMPTY_PRESET_CONTENT } from '@nostube/core/preset'
import { PresetProvider, usePresetContext } from './PresetContext'
import { setCachedPreset } from '@/lib/preset-storage'

const state = vi.hoisted(() => ({
  config: { selectedPresetPubkey: null as string | null, relays: [] },
  updateConfig: vi.fn(),
  streams: new Map<string, Subject<NostrEvent>>(),
}))
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: state.config, updateConfig: state.updateConfig, pool: {} }),
}))
vi.mock('applesauce-loaders/loaders', async importOriginal => ({
  ...(await importOriginal<typeof Loaders>()),
  createAddressLoader:
    () =>
    ({ pubkey }: { pubkey: string }) => {
      const stream = new Subject<NostrEvent>()
      state.streams.set(pubkey, stream)
      return stream
    },
}))

const alternate = 'a'.repeat(64)
const legacy = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81'
function Viewer() {
  const { preset, selectedPubkey } = usePresetContext()
  return (
    <output>
      {selectedPubkey}:{preset?.blockedPubkeys.join(',')}
    </output>
  )
}
function mount() {
  const store = new EventStore()
  store.verifyEvent = () => true
  return render(
    <EventStoreProvider eventStore={store}>
      <PresetProvider>
        <Viewer />
      </PresetProvider>
    </EventStoreProvider>
  )
}
function deliver(pubkey: string) {
  state.streams.get(pubkey)!.next({
    id: pubkey,
    sig: '0'.repeat(128),
    pubkey,
    created_at: 1,
    kind: 30078,
    tags: [
      ['d', 'nostube-presets'],
      ['name', 'Moderation'],
    ],
    content: JSON.stringify({ ...EMPTY_PRESET_CONTENT, blockedPubkeys: ['blocked-author'] }),
  })
}

beforeEach(() => {
  localStorage.clear()
  state.config.selectedPresetPubkey = null
  state.streams.clear()
  state.updateConfig.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('preset resolution', () => {
  it('uses admin moderation when an explicit preset is missing without overwriting the choice', async () => {
    state.config.selectedPresetPubkey = alternate
    mount()
    await act(async () => state.streams.get(alternate)!.complete())
    await act(async () => deliver(DEFAULT_PRESET_PUBKEY))
    expect(screen.getByRole('status').textContent).toBe(`${DEFAULT_PRESET_PUBKEY}:blocked-author`)
    expect(state.updateConfig).not.toHaveBeenCalled()
  })

  it('falls back after a silent relay times out and stops with an error if admin is also unavailable', async () => {
    vi.useFakeTimers()
    state.config.selectedPresetPubkey = alternate
    mount()
    await act(async () => vi.advanceTimersByTime(10000))
    await act(async () => state.streams.get(DEFAULT_PRESET_PUBKEY)!.complete())
    expect(screen.getByText('Failed to load configuration')).toBeTruthy()
    expect(state.streams.size).toBe(2)
  })

  it('never uses the retired personal preset, including its cached moderation lists', async () => {
    state.config.selectedPresetPubkey = legacy
    setCachedPreset(
      {
        ...EMPTY_PRESET_CONTENT,
        pubkey: legacy,
        name: 'Retired',
        createdAt: 1,
        blockedPubkeys: ['old-block'],
      },
      legacy
    )
    mount()
    await act(async () => deliver(DEFAULT_PRESET_PUBKEY))
    expect(screen.getByRole('status').textContent).toBe(`${DEFAULT_PRESET_PUBKEY}:blocked-author`)
    expect(state.streams.has(legacy)).toBe(false)
  })

  it('keeps matching cached moderation during an outage and discards it when another preset is selected', async () => {
    state.config.selectedPresetPubkey = alternate
    setCachedPreset(
      {
        ...EMPTY_PRESET_CONTENT,
        pubkey: alternate,
        name: 'Cached',
        createdAt: 1,
        blockedPubkeys: ['cached-block'],
      },
      alternate
    )
    const view = mount()
    await act(async () => state.streams.get(alternate)!.complete())
    expect(screen.getByRole('status').textContent).toBe(`${alternate}:cached-block`)
    state.config.selectedPresetPubkey = DEFAULT_PRESET_PUBKEY
    view.rerender(
      <EventStoreProvider eventStore={new EventStore()}>
        <PresetProvider>
          <Viewer />
        </PresetProvider>
      </EventStoreProvider>
    )
    expect(screen.queryByText(`${alternate}:cached-block`)).toBeNull()
    expect(screen.getByText('Loading app configuration...')).toBeTruthy()
  })
})
