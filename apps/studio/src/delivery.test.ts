import { describe, expect, it } from 'vitest'
import type { OutboxJob } from './api'
import { outboxTargets } from './delivery'

const job = (patch: Partial<OutboxJob>): OutboxJob => ({
  id: 1,
  kind: 'blob',
  target: 'https://mirror.example',
  ref: 'a'.repeat(64),
  status: 'done',
  attempts: 1,
  lastError: null,
  nextAttemptAt: null,
  updatedAt: 1,
  active: false,
  ...patch,
})

describe('outboxTargets', () => {
  it('never reports a canceled or abandoned job as confirmed', () => {
    const [canceled, removed] = outboxTargets([
      job({ target: 'wss://a.example', kind: 'event', lastError: 'canceled' }),
      job({ target: 'wss://b.example', kind: 'event', status: 'pending', active: false }),
    ])
    expect(canceled).toMatchObject({ status: 'failed', message: 'canceled' })
    expect(removed.status).toBe('failed')
  })

  it('keeps a retrying job pending with its error and the earliest next attempt', () => {
    const [target] = outboxTargets([
      job({ id: 1 }),
      job({ id: 2, status: 'pending', active: true, lastError: '503', nextAttemptAt: 200 }),
      job({ id: 3, status: 'pending', active: true, nextAttemptAt: 100 }),
    ])
    expect(target).toMatchObject({ status: 'pending', nextAttemptAt: 100 })
    expect(target.message).toContain('503')
  })
})
