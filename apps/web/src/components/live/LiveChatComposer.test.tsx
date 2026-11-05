import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'
import type { LiveStream } from '@nostube/core/live-stream'
import { LiveChatComposer } from './LiveChatComposer'

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

const stream = { address: `30311:${'a'.repeat(64)}:show` } as LiveStream
const relays = ['wss://chat.example', 'wss://fallback.example']

function renderComposer() {
  render(
    <I18nextProvider i18n={i18n}>
      <LiveChatComposer stream={stream} relays={relays} />
    </I18nextProvider>
  )
  return screen.queryByRole('textbox', { name: /chat message/i }) as HTMLTextAreaElement
}

const ctrlEnter = (field: HTMLElement) => fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })

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
})
