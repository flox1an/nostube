import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminStats } from './api'
import i18n from './i18n'
import { OverviewPage } from './OverviewPage'

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

const ok = (body: AdminStats) => ({ ok: true, status: 200, json: async () => body })

describe('OverviewPage', () => {
  const fetch = vi.fn()
  beforeEach(async () => {
    vi.stubGlobal('fetch', fetch)
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetch.mockReset()
  })

  it('keeps the latest answer when an older request lands after it, and caps the quota bar', async () => {
    let late!: (value: unknown) => void
    fetch
      .mockReturnValueOnce(new Promise(resolve => (late = resolve)))
      .mockResolvedValueOnce(ok(stats(1234, 150, 100)))
    // StrictMode mounts twice, as in the studio: the first, abandoned request answers last.
    render(
      <StrictMode>
        <OverviewPage />
      </StrictMode>
    )
    const bar = await screen.findByRole('progressbar', { name: 'Storage quota used' })
    expect(bar.getAttribute('value')).toBe('100')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith('/api/admin/stats', { credentials: 'same-origin' })

    await act(async () => late(ok(stats(7, 0, 0))))
    expect(screen.getAllByText('1,234')).toHaveLength(2) // the total and the kind 21 bar
    expect(screen.queryByText('Unlimited')).toBeNull()
  })

  it('shows the server error without values, then loads on refresh', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'disk on fire' }),
    })
    render(<OverviewPage />)
    expect(await screen.findByText('disk on fire')).toBeTruthy()
    expect(screen.queryByText('Stored events')).toBeNull()

    fetch.mockResolvedValueOnce(ok(stats(0, 0, 0)))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('Unlimited')).toBeTruthy()
    expect(screen.getByText('The relay stores no events yet.')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('disk on fire')).toBeNull()
  })
})
