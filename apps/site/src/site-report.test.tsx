import './i18n'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountManager } from 'applesauce-accounts'
import { PrivateKeyAccount } from 'applesauce-accounts/accounts'
import { AccountsProvider } from 'applesauce-react/providers'
import { finalizeEvent, verifyEvent, type NostrEvent } from 'nostr-tools'
import { describe, expect, it, vi } from 'vitest'
import { NostubeHostProvider, type NostubeHost } from '@nostube/widgets/host'
import { SiteReport } from './SiteReport'

const videoAuthor = 'c'.repeat(64)
const videoId = 'e'.repeat(64)
const relays = ['wss://interact.example']

type Publish = (relays: string[], event: NostrEvent) => Promise<unknown[]>

function renderReport(publish: Publish, account?: PrivateKeyAccount) {
  const pool = {
    request: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
    publish: vi.fn(publish),
  }
  const manager = new AccountManager()
  if (account) {
    manager.addAccount(account)
    manager.setActive(account)
  }
  const host = { pool, config: {}, relays: {} } as unknown as NostubeHost
  render(
    <NostubeHostProvider value={host}>
      <AccountsProvider manager={manager}>
        <SiteReport target={{ type: 'video', id: videoId, author: videoAuthor }} relays={relays} />
      </AccountsProvider>
    </NostubeHostProvider>
  )
  return pool.publish
}

describe('SiteReport', () => {
  it('shows a guest no report button, since only a signed-in visitor can sign one', () => {
    renderReport(async () => [])
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens a dialog and publishes a signed kind 1984 event tagging the video and its author', async () => {
    const account = PrivateKeyAccount.generateNew()
    vi.spyOn(account.signer, 'signEvent').mockImplementation(async template =>
      finalizeEvent(template, Uint8Array.from(account.signer.key))
    )
    const publish = renderReport(async () => [{ ok: true, from: relays[0] }], account)

    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('button', { name: /submit report/i }))

    await waitFor(() => expect(publish).toHaveBeenCalled())
    const [sentTo, report] = publish.mock.calls[0]
    expect(sentTo).toEqual(relays)
    expect(report).toMatchObject({ kind: 1984, pubkey: account.pubkey })
    expect(verifyEvent(report)).toBe(true)
    expect(report.tags).toEqual(
      expect.arrayContaining([
        ['e', videoId, 'spam'],
        ['p', videoAuthor, 'spam'],
      ])
    )
    expect((await screen.findByText(/report sent/i)).textContent).toContain('Report sent')
  })

  it('carries the selected reason and keeps the dialog retryable on refusal', async () => {
    const account = PrivateKeyAccount.generateNew()
    vi.spyOn(account.signer, 'signEvent').mockImplementation(async template =>
      finalizeEvent(template, Uint8Array.from(account.signer.key))
    )
    const publish = renderReport(
      async () => [{ ok: false, from: relays[0], message: 'restricted: not locally resolvable' }],
      account
    )

    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: /harassment/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'restricted: not locally resolvable'
    )
    expect(publish.mock.calls[0][1].tags).toEqual(
      expect.arrayContaining([
        ['e', videoId, 'harassment'],
        ['p', videoAuthor, 'harassment'],
      ])
    )
    // Still open and retryable: the submit button is there to click again.
    const retry = screen.getByRole('button', { name: /submit report/i })
    expect(retry.hasAttribute('disabled')).toBe(false)
  })
})
