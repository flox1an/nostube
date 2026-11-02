import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminStats } from './api'
import i18n from './i18n'
import { OverviewPage } from './OverviewPage'
import { fakeAdminApi, refusal } from './test-admin-api'

const stats = (events: number, storageBytes: number, quotaBytes: number): AdminStats => ({
  relay: {
    url: 'wss://videos.example.org',
    totalEvents: events,
    eventsByKind: events ? [{ kind: 21, count: events }] : [],
    databaseBytes: 4096,
  },
  blossom: {
    url: 'https://videos.example.org',
    files: 2,
    storageBytes,
    quotaBytes,
    freeDiskBytes: 10 * 1024 ** 3,
    freeSpaceReserveBytes: 1024 ** 3,
    uploads: 3,
    downloads: 4,
    servedBytes: 2048,
  },
})

/** The instance answering `GET /api/admin/stats` with `answers` in turn. */
const serve = (...answers: unknown[]) =>
  fakeAdminApi({ 'GET /api/admin/stats': () => answers.shift() })

describe('OverviewPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the latest answer when an older request lands after it, and caps the quota bar', async () => {
    let late!: (value: AdminStats) => void
    const { calls } = serve(new Promise(resolve => (late = resolve)), stats(1234, 150, 100))
    // StrictMode mounts twice, as in the studio: the first, abandoned request answers last.
    render(
      <StrictMode>
        <OverviewPage />
      </StrictMode>
    )
    const bar = await screen.findByRole('progressbar', { name: 'Storage quota used' })
    expect(bar.getAttribute('value')).toBe('100')
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'GET /api/admin/stats',
      'GET /api/admin/stats',
    ])
    expect(calls.every(c => c.init?.credentials === 'same-origin')).toBe(true)

    await act(async () => late(stats(7, 0, 0)))
    expect(screen.getAllByText('1,234')).toHaveLength(2) // the total and the kind 21 bar
    expect(screen.queryByText('Unlimited')).toBeNull()
  })

  it('shows the server error without values, then loads on refresh', async () => {
    serve(refusal(500, 'disk on fire'), stats(0, 0, 0))
    render(<OverviewPage />)
    expect(await screen.findByText('disk on fire')).toBeTruthy()
    expect(screen.queryByText('Stored events')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Unlimited')).toBeTruthy()
    expect(screen.getByText('The relay stores no events yet.')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('disk on fire')).toBeNull()
  })
})
