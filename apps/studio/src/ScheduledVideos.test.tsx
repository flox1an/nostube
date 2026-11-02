import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledVideo } from './api'
import { ScheduledVideos } from './ScheduledVideos'
import { SignerProvider } from './signer-context'
import { fakeAdminApi } from './test-admin-api'
import './i18n'

const event = (title: string) => ({
  id: title,
  pubkey: 'a'.repeat(64),
  created_at: 1,
  kind: 34235,
  tags: [
    ['d', title],
    ['title', title],
  ],
  content: '',
  sig: 'b'.repeat(128),
})
const item = (id: string, state: ScheduledVideo['state'], extra: Partial<ScheduledVideo> = {}) =>
  ({
    id,
    kind: 34235,
    identifier: id,
    dueAt: 4_000_000_000,
    state,
    error: null,
    releasedAt: null,
    event: event(id),
    ...extra,
  }) satisfies ScheduledVideo

let items: ScheduledVideo[]
let sent: (key: string) => unknown[]

beforeEach(() => {
  items = [
    item('Soon', 'scheduled'),
    item('Done', 'released', { releasedAt: 1_900_000_000 }),
    item('Refused', 'failed', { error: 'blocked: this event was deleted by its author' }),
  ]
  sent = fakeAdminApi({
    'GET /api/admin/schedule': () => ({ items }),
    'POST /api/admin/schedule/cancel': { cancelled: true },
    'GET /api/admin/signer': { mode: 'none', pubkey: null },
  }).sent
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const renderList = () =>
  render(
    <SignerProvider creatorKey={null}>
      <ScheduledVideos />
    </SignerProvider>
  )

describe('ScheduledVideos', () => {
  it('shows each video with its state and offers cancelling only while scheduled', async () => {
    renderList()
    await screen.findByText('Soon')
    expect(screen.getByText(/^Scheduled for /)).toBeTruthy()
    expect(screen.getByText(/^Published /)).toBeTruthy()
    expect(screen.getByText('blocked: this event was deleted by its author')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Cancel publication' })).toHaveLength(1)
  })

  it('drops the stored video only after the creator confirms', async () => {
    renderList()
    await screen.findByText('Soon')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel publication' }))
    expect(sent('POST /api/admin/schedule/cancel')).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel publication' }))
    await waitFor(() => expect(sent('POST /api/admin/schedule/cancel')).toEqual([{ id: 'Soon' }]))
  })

  it('stays out of the way when nothing is scheduled', async () => {
    items = []
    const { container } = renderList()
    await waitFor(() => expect(sent('GET /api/admin/schedule')).not.toHaveLength(0))
    expect(container.textContent).toBe('')
  })
})
