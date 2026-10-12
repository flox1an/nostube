import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ScheduledVideo } from './api'
import { ScheduledVideos } from './ScheduledVideos'
import { SignerProvider } from './signer-context'
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
let fetchMock: Mock

beforeEach(() => {
  items = [
    item('Soon', 'scheduled'),
    item('Done', 'released', { releasedAt: 1_900_000_000 }),
    item('Refused', 'failed', { error: 'blocked: this event was deleted by its author' }),
  ]
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/admin/schedule') return new Response(JSON.stringify({ items }))
    if (url === '/api/admin/schedule/cancel')
      return new Response(JSON.stringify({ cancelled: true }))
    return new Response(JSON.stringify({ mode: 'none', pubkey: null }))
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const renderList = () =>
  render(
    <SignerProvider>
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
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/schedule/cancel', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel publication' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/schedule/cancel',
        expect.objectContaining({ body: JSON.stringify({ id: 'Soon' }) })
      )
    )
  })

  it('stays out of the way when nothing is scheduled', async () => {
    items = []
    const { container } = renderList()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/schedule', expect.anything())
    )
    expect(container.textContent).toBe('')
  })
})
