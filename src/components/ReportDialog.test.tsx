import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n/config'
import type { EventTemplate } from 'nostr-tools'
import { ReportDialog } from './ReportDialog'

const publish = vi.fn<(args: { event: EventTemplate }) => Promise<void>>()
const updateConfig = vi.fn()

vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ publish, isPending: false, error: null }),
}))

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { reportedEventIds: [] }, updateConfig }),
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const AUTHOR = 'a'.repeat(64)
const EVENT_ID = 'e'.repeat(64)

function renderDialog(props: Parameters<typeof ReportDialog>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ReportDialog {...props} />
    </I18nextProvider>
  )
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
  await waitFor(() => expect(publish).toHaveBeenCalled())
  return publish.mock.calls[0][0].event
}

describe('ReportDialog', () => {
  beforeEach(() => {
    publish.mockReset()
    publish.mockResolvedValue(undefined)
    updateConfig.mockReset()
  })

  it('reports a video by tagging the event and its author, and hides it locally', async () => {
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      reportType: 'video',
      contentId: EVENT_ID,
      contentAuthor: AUTHOR,
    })

    const event = await submit()

    expect(event.kind).toBe(1984)
    expect(event.tags).toEqual([
      ['e', EVENT_ID, 'spam'],
      ['p', AUTHOR, 'spam'],
    ])
    expect(updateConfig).toHaveBeenCalled()
  })

  it('reports an account with only a p tag, and never hides a pubkey as an event id', async () => {
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      reportType: 'profile',
      contentId: AUTHOR,
      contentAuthor: AUTHOR,
    })

    const event = await submit()

    expect(event.tags).toEqual([['p', AUTHOR, 'spam']])
    expect(updateConfig).not.toHaveBeenCalled()
  })

  it('carries the selected reason into the report tags', async () => {
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      reportType: 'profile',
      contentId: AUTHOR,
    })

    fireEvent.click(screen.getByRole('radio', { name: /harassment or abuse/i }))
    const event = await submit()

    expect(event.tags).toEqual([['p', AUTHOR, 'harassment']])
  })
})
