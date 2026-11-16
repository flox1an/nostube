import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { finalizeEvent, getPublicKey, nip19, verifyEvent } from 'nostr-tools'
import type { VerifiedEvent } from 'applesauce-core/helpers/event'
import i18n from '@/i18n/config'
import type { LiveStream } from '@nostube/core/live-stream'
import { LiveChatComposer } from './LiveChatComposer'

const pepe = { shortcode: 'pepe', url: 'https://cdn.example/pepe.png', address: '30030:c:set' }

const state = vi.hoisted(() => ({
  user: undefined as { pubkey: string } | undefined,
  publish: vi.fn(),
}))

vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: state.user }) }))
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ publish: state.publish, isPending: false, error: null }),
}))
vi.mock('@/components/auth/AuthDialog', () => ({
  AuthDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Auth dialog</div> : null),
}))
vi.mock('@/hooks/useChatEmotes', () => ({
  useChatEmotes: () => ({ channel: [pepe], mine: [] }),
}))
vi.mock('@/hooks/useFollowSet', () => ({ useFollowSet: () => ({ followedPubkeys: [] }) }))
vi.mock('@/hooks/useSearchProfiles', () => ({
  useSearchProfiles: () => ({ profiles: [], loading: false }),
}))

const stream = { address: `30311:${'a'.repeat(64)}:show`, hostPubkey: 'a'.repeat(64) } as LiveStream
const relays = ['wss://chat.example', 'wss://fallback.example']

// A chatter with a profile in the store, offered after `@`.
const aliceKey = new Uint8Array(32).fill(1)
const alice = getPublicKey(aliceKey)

function renderComposer() {
  const store = new EventStore()
  store.verifyEvent = (candidate): candidate is VerifiedEvent => verifyEvent(candidate)
  store.add(
    finalizeEvent(
      { kind: 0, content: JSON.stringify({ name: 'Alice' }), tags: [], created_at: 1 },
      aliceKey
    )
  )
  render(
    <I18nextProvider i18n={i18n}>
      <EventStoreProvider eventStore={store}>
        <LiveChatComposer stream={stream} relays={relays} participants={[alice]} />
      </EventStoreProvider>
    </I18nextProvider>
  )
  return screen.queryByRole('combobox', { name: /chat message/i }) as HTMLTextAreaElement
}

const ctrlEnter = (field: HTMLElement) => fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })

const type = (field: HTMLTextAreaElement, value: string) => {
  act(() => field.focus())
  fireEvent.change(field, { target: { value } })
}

describe('LiveChatComposer', () => {
  beforeEach(() => {
    state.user = { pubkey: 'b'.repeat(64) }
    state.publish.mockReset()
  })

  it('offers sign-in instead of a field to guests', () => {
    state.user = undefined
    expect(renderComposer()).toBeNull()
    expect(screen.queryByRole('button', { name: /send chat/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /sign in to chat/i }))
    expect(screen.getByText('Auth dialog')).toBeInTheDocument()
    expect(state.publish).not.toHaveBeenCalled()
  })

  it('publishes a kind 1311 message tagged with the stream to the chat relays', async () => {
    state.publish.mockResolvedValue({})
    const field = renderComposer()
    fireEvent.change(field, { target: { value: '  hello stream  ' } })
    fireEvent.click(screen.getByRole('button', { name: /send chat/i }))

    await waitFor(() => expect(field.value).toBe(''))
    expect(state.publish).toHaveBeenCalledWith({
      event: {
        kind: 1311,
        content: 'hello stream',
        tags: [['a', stream.address, 'wss://chat.example']],
        created_at: expect.any(Number),
      },
      relays,
      label: expect.any(String),
    })
    expect(field).toHaveFocus()
  })

  it('restores the failed message and shows the failure when publishing is rejected', async () => {
    const pending = Promise.withResolvers<unknown>()
    state.publish.mockReturnValue(pending.promise)
    const field = renderComposer()
    fireEvent.change(field, { target: { value: 'keep me' } })
    ctrlEnter(field)
    expect(field.value).toBe('')

    await act(async () => pending.reject(new Error('relay said no')))
    expect(screen.getByRole('alert')).toHaveTextContent('relay said no')
    expect(field.value).toBe('keep me')
  })

  it('clears the field as soon as a message is sent, before publishing completes', () => {
    state.publish.mockReturnValue(new Promise(() => {}))
    const field = renderComposer()
    fireEvent.change(field, { target: { value: 'instant' } })
    ctrlEnter(field)

    expect(state.publish).toHaveBeenCalledTimes(1)
    expect(field.value).toBe('')
    expect(field).toHaveFocus()
  })

  it('keeps text typed while a send is pending when it succeeds', async () => {
    const pending = Promise.withResolvers<unknown>()
    state.publish.mockReturnValue(pending.promise)
    const field = renderComposer()
    fireEvent.change(field, { target: { value: 'first' } })
    ctrlEnter(field)
    fireEvent.change(field, { target: { value: 'second' } })

    await act(async () => pending.resolve({}))
    expect(field.value).toBe('second')
  })

  it('keeps text typed while a send is pending when it fails', async () => {
    const pending = Promise.withResolvers<unknown>()
    state.publish.mockReturnValue(pending.promise)
    const field = renderComposer()
    fireEvent.change(field, { target: { value: 'first' } })
    ctrlEnter(field)
    fireEvent.change(field, { target: { value: 'second' } })

    await act(async () => pending.reject(new Error('relay said no')))
    expect(screen.getByRole('alert')).toHaveTextContent('relay said no')
    expect(field.value).toBe('second')
  })

  it('sends once while a publish is pending', async () => {
    const pending = Promise.withResolvers<unknown>()
    state.publish.mockReturnValue(pending.promise)
    const field = renderComposer()
    fireEvent.change(field, { target: { value: 'once' } })
    ctrlEnter(field)
    fireEvent.change(field, { target: { value: 'twice' } })
    ctrlEnter(field)
    fireEvent.click(screen.getByRole('button', { name: /send chat/i }))

    expect(state.publish).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve({}))
  })

  it('treats plain Enter as a newline and Ctrl+Enter as send', async () => {
    state.publish.mockResolvedValue({})
    const field = renderComposer()
    fireEvent.change(field, { target: { value: 'line one' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true, isComposing: true })
    expect(state.publish).not.toHaveBeenCalled()

    ctrlEnter(field)
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1))
  })

  it('links a chatter picked after @ and notifies them with a p tag', async () => {
    state.publish.mockResolvedValue({})
    const field = renderComposer()
    type(field, 'hi @al')
    expect(screen.getByRole('option', { name: /alice/i })).toBeInTheDocument()

    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field.value).toBe('hi @Alice ')
    ctrlEnter(field)

    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1))
    expect(state.publish.mock.calls[0][0].event).toMatchObject({
      content: `hi nostr:${nip19.npubEncode(alice)}`,
      tags: [
        ['a', stream.address, 'wss://chat.example'],
        ['p', alice],
      ],
    })
  })

  it('completes a channel emote after a colon and sends its emoji tag', async () => {
    state.publish.mockResolvedValue({})
    const field = renderComposer()
    type(field, 'gg :pe')
    expect(screen.getByRole('option', { name: /:pepe:.*channel/i })).toBeInTheDocument()

    fireEvent.keyDown(field, { key: 'Tab' })
    expect(field.value).toBe('gg :pepe: ')
    ctrlEnter(field)

    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(1))
    expect(state.publish.mock.calls[0][0].event.tags).toEqual([
      ['a', stream.address, 'wss://chat.example'],
      ['emoji', 'pepe', pepe.url, pepe.address],
    ])
  })

  it('closes the suggestions on Escape and lets Enter be a newline again', () => {
    const field = renderComposer()
    type(field, '@')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(field).toHaveAttribute('aria-expanded', 'false')
  })
})
