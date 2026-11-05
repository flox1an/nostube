import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  beginPublication,
  dismissPublication,
  updatePublication,
  usePublications,
} from '../publication'
import { PublicationStatusButton } from './PublicationStatus'

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

it('shows confirmations without opening automatically, including slow or failed targets', () => {
  vi.useFakeTimers()
  render(<PublicationStatusButton />)
  let id = ''
  act(() => {
    id = beginPublication({
      label: 'Publish video',
      phase: 'publishing',
      targets: [
        { url: 'wss://fast.example', status: 'confirmed' },
        { url: 'wss://slow.example', status: 'pending' },
      ],
    })
    vi.advanceTimersByTime(10000)
  })
  const trigger = screen.getByRole('button', { name: /Publishing activity/ })
  expect(trigger).toHaveTextContent('1/2')
  expect(trigger).toHaveClass('text-destructive')
  expect(screen.queryByText('Publish video')).toBeNull()
  act(() => {
    updatePublication(id, {
      status: 'partial',
      targets: [
        { url: 'wss://fast.example', status: 'confirmed' },
        { url: 'wss://slow.example', status: 'timeout' },
      ],
    })
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(trigger)
  expect(screen.getByText('Publish video')).toBeVisible()
  expect(screen.getByText('wss://slow.example')).toBeVisible()
  expect(screen.getByText('No confirmation in time')).toBeVisible()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('updates the total across publications and retries failed targets from the dropdown', async () => {
  const retry = vi.fn(async () => {
    updatePublication(failedId, {
      status: 'success',
      targets: [{ url: 'wss://retry.example', status: 'confirmed' }],
      error: undefined,
      retry: undefined,
    })
  })
  render(<PublicationStatusButton />)
  let failedId = ''
  act(() => {
    const id = beginPublication({
      label: 'Comment',
      phase: 'publishing',
      targets: [{ url: 'wss://ok.example', status: 'confirmed' }],
    })
    updatePublication(id, { status: 'success' })
    failedId = beginPublication({
      label: 'Reaction',
      phase: 'publishing',
      targets: [{ url: 'wss://retry.example', status: 'failed' }],
    })
    updatePublication(failedId, { status: 'failed', error: 'offline', retry })
  })
  const trigger = screen.getByRole('button', { name: /Publishing activity/ })
  expect(trigger).toHaveTextContent('1/2')
  fireEvent.click(trigger)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed targets' }))
  })
  expect(retry).toHaveBeenCalledOnce()
  expect(trigger).toHaveTextContent('2/2')
  expect(trigger).not.toHaveClass('text-destructive')
  fireEvent.click(screen.getAllByRole('button', { name: 'Hide status (does not cancel)' })[0])
  expect(trigger).toHaveTextContent('1/1')
})
