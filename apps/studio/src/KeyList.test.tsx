import { fireEvent, render, screen } from '@testing-library/react'
import { nip19 } from 'nostr-tools'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import './i18n'
import { KeyList } from './KeyList'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

vi.mock('nostr-tools/nip05', async importOriginal => ({
  ...(await importOriginal<object>()),
  queryProfile: vi.fn(async (address: string) =>
    address === 'me@example.org' ? { pubkey: 'b'.repeat(64) } : null
  ),
}))

function Harness({ initial, onText }: { initial: string; onText: (text: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <KeyList
      id="keys"
      label="Creators"
      hint="hint"
      firstLabel="Start page"
      text={text}
      onChange={next => {
        setText(next)
        onText(next)
      }}
    />
  )
}

const add = (value: string) => {
  fireEvent.change(screen.getByLabelText('Creators'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

describe('KeyList', () => {
  it('adds npub, hex and NIP-05 keys as hex, rejects the rest, removes', async () => {
    const onText = vi.fn()
    render(<Harness initial={A} onText={onText} />)
    expect(screen.getByText('Start page')).toBeTruthy()

    add('nonsense')
    expect(await screen.findByText(/Not a key/)).toBeTruthy()
    add('nobody@example.org')
    expect(await screen.findByText(/No key found for nobody@example.org/)).toBeTruthy()

    add('me@example.org')
    await vi.waitFor(() => expect(onText).toHaveBeenLastCalledWith(`${A}\n${B}`))
    add(nip19.npubEncode(A)) // already listed
    expect(onText).toHaveBeenCalledTimes(1)

    const npubB = nip19.npubEncode(B)
    fireEvent.click(
      screen.getByRole('button', { name: `Remove ${npubB.slice(0, 12)}…${npubB.slice(-6)}` })
    )
    expect(onText).toHaveBeenLastCalledWith(A)
  })
})
