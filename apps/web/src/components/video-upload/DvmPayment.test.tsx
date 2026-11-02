import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { DvmPayment } from './DvmPayment'

const state = vi.hoisted(() => ({ pay: vi.fn(), sign: vi.fn(), publish: vi.fn(), mint: vi.fn() }))
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'alice', signer: { signEvent: state.sign } } }),
}))
vi.mock('@/contexts/WalletContext', () => ({
  useWalletContext: () => ({
    walletType: 'nwc',
    isConnected: true,
    cashuMints: [],
    payInvoice: state.pay,
  }),
}))
vi.mock('@/nostr/core', () => ({ relayPool: { publish: state.publish }, eventStore: {} }))
vi.mock('@cashu/cashu-ts', () => ({
  Wallet: class {
    async loadMint() {}
    async createMintQuoteBolt11() {
      return { request: 'invoice' }
    }
    async mintProofsBolt11() {
      return state.mint()
    }
  },
  getEncodedToken: () => 'proof-token',
  normalizeProofAmounts: (proofs: unknown) => proofs,
}))

it('does not pay the Lightning invoice again when a relay rejects the payment event', async () => {
  const signed = {
    id: 'payment-1',
    kind: 7000,
    pubkey: 'alice',
    content: '',
    tags: [],
    created_at: 1,
    sig: 'signature',
  }
  state.pay.mockResolvedValue(undefined)
  state.mint.mockResolvedValue([{ amount: 1 }])
  state.sign.mockResolvedValue(signed)
  state.publish
    .mockResolvedValueOnce([
      { from: 'wss://relay', ok: false, message: 'blocked: temporarily unavailable' },
    ])
    .mockResolvedValueOnce([{ from: 'wss://relay', ok: true }])
  const onPaid = vi.fn()
  render(
    <DvmPayment
      bid={{ amount: '1000', pubkey: 'dvm', cashu: 'https://mint.example', eventId: 'bid' }}
      requestEventId="request"
      writeRelays={['wss://relay']}
      onPaid={onPaid}
      onCancel={() => {}}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pay 1 sats' }))
  await screen.findByText(/temporarily unavailable/)
  fireEvent.click(screen.getByRole('button', { name: 'Pay 1 sats' }))
  await waitFor(() => expect(onPaid).toHaveBeenCalledOnce())
  expect(state.pay).toHaveBeenCalledOnce()
  expect(state.mint).toHaveBeenCalledOnce()
  expect(state.sign).toHaveBeenCalledOnce()
  expect(state.publish.mock.calls.map(call => call[1])).toEqual([signed, signed])
})
