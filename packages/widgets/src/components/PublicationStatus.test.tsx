import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  beginPublication,
  dismissPublication,
  updatePublication,
  usePublications,
} from '../publication'
import { PublicationStatusHost } from './PublicationStatus'
import { Dialog, DialogContent, DialogTitle } from './dialog'

function ResetActivities() {
  const activities = usePublications()
  return (
    <button
      onClick={() =>
        activities.forEach(activity => {
          updatePublication(activity.id, { status: 'success' })
          dismissPublication(activity.id)
        })
      }
    >
      Reset
    </button>
  )
}
afterEach(() => {
  cleanup()
  render(<ResetActivities />)
  fireEvent.click(screen.getByText('Reset'))
  cleanup()
  vi.useRealTimers()
})

it('reveals a slow target after unchanged polls, and resurfaces a failure after hiding the wait', () => {
  vi.useFakeTimers()
  render(<PublicationStatusHost />)
  let id = ''
  act(() => {
    id = beginPublication({
      label: 'Publish video',
      phase: 'publishing',
      targets: [{ url: 'wss://slow.example', status: 'pending' }],
    })
  })
  expect(screen.queryByRole('region', { name: 'Publish video' })).toBeNull()
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  expect(screen.getByRole('button', { name: 'Show details' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  act(() => {
    vi.advanceTimersByTime(5000)
    updatePublication(id, { targets: [{ url: 'wss://slow.example', status: 'pending' }] })
    vi.advanceTimersByTime(1500)
  })
  expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute(
    'aria-expanded',
    'true'
  )
  expect(screen.getByText('wss://slow.example')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Hide status (does not cancel)' }))
  expect(screen.queryByText('Publish video')).toBeNull()
  act(() => {
    updatePublication(id, {
      status: 'failed',
      error: 'No confirmation',
      targets: [{ url: 'wss://slow.example', status: 'timeout' }],
    })
  })
  expect(screen.getByText('Publish video')).toBeVisible()
  expect(screen.getByText('No confirmation in time')).toBeVisible()
})

it('keeps a failed publication retry inside the active modal', async () => {
  const retry = vi.fn(async () => {})
  render(
    <>
      <Dialog open>
        <DialogContent>
          <DialogTitle>Write comment</DialogTitle>
        </DialogContent>
      </Dialog>
      <PublicationStatusHost />
    </>
  )
  act(() => {
    const id = beginPublication({ label: 'Comment', phase: 'publishing' })
    updatePublication(id, { status: 'failed', error: 'offline', retry })
  })
  const dialog = await screen.findByRole('dialog', { name: 'Write comment' })
  const button = await screen.findByRole('button', { name: 'Retry failed targets' })
  expect(dialog).toContainElement(button)
  fireEvent.click(button)
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.getByRole('dialog', { name: 'Write comment' })).toBeVisible()
})
