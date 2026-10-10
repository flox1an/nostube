import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MirrorCard } from './MirrorCard'
import './i18n'

const status = (failed: number) => ({
  relays: ['wss://mirror.example'],
  blossom: [],
  counts: [{ target: 'wss://mirror.example', kind: 'event', pending: 1, done: 4, failed }],
  problems: [
    {
      kind: 'event',
      target: 'wss://mirror.example',
      ref: 'a'.repeat(64),
      status: failed ? 'failed' : 'pending',
      attempts: 24,
      lastError: 'relay refused: blocked',
      nextAttemptAt: null,
      updatedAt: 1_700_000_000,
    },
  ],
})

const json = (body: unknown) => new Response(JSON.stringify(body))

let calls: { url: string; body?: string }[]

beforeEach(() => {
  calls = []
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows the counts and the last error of a failed job and retries only when something failed', async () => {
  let failed = 1
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined })
      if (url === '/api/admin/outbox/retry') {
        failed = 0
        return json({ retried: 1 })
      }
      return json(status(failed))
    })
  )
  render(<MirrorCard />)

  expect(await screen.findByText('relay refused: blocked')).toBeTruthy()
  expect(screen.getByText('wss://mirror.example')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))
  await waitFor(() => expect(screen.getByText('1 job queued again.')).toBeTruthy())

  const retry = calls.find(c => c.url === '/api/admin/outbox/retry')
  expect(retry?.body).toBe('{}')
  // Nothing failed any more: the button is off, so a click cannot queue nothing.
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Retry failed' }) as HTMLButtonElement).disabled
    ).toBe(true)
  )
})
