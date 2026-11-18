import { describe, expect, it } from 'vitest'
import { planUpload } from './upload-plan'

const A = 'https://a.example'
const B = 'https://b.example'
const C = 'https://c.example'
const MB = 1024 * 1024

describe('planUpload', () => {
  it('uploads to the first server and mirrors to the rest when nothing is known', () => {
    expect(planUpload([A, B, C], {}, 10 * MB)).toEqual({
      targets: [
        { server: A, method: 'upload' },
        { server: B, method: 'mirror' },
        { server: C, method: 'mirror' },
      ],
      skipped: [],
    })
  })

  it('uploads directly to a server known not to mirror', () => {
    const plan = planUpload([A, B, C], { [B]: { mirror: false } }, 10 * MB)
    expect(plan.targets).toEqual([
      { server: A, method: 'upload' },
      { server: B, method: 'upload' },
      { server: C, method: 'mirror' },
    ])
  })

  it('skips a server whose size limit the file exceeds', () => {
    const plan = planUpload([A, B], { [A]: { maxFileSize: 100 * MB } }, 300 * MB)
    expect(plan.targets).toEqual([{ server: B, method: 'upload' }])
    expect(plan.skipped).toEqual([{ server: A, reason: 'too-large' }])
  })

  it('keeps a server whose limit the file fits exactly', () => {
    const plan = planUpload([A], { [A]: { maxFileSize: 100 * MB } }, 100 * MB)
    expect(plan.targets).toEqual([{ server: A, method: 'upload' }])
  })

  it('returns no targets when no server accepts the file', () => {
    const plan = planUpload([A], { [A]: { maxFileSize: MB } }, 2 * MB)
    expect(plan.targets).toEqual([])
    expect(plan.skipped).toHaveLength(1)
  })

  it('makes a server the primary when it is measured at least twice as fast', () => {
    const plan = planUpload(
      [A, B, C],
      { [A]: { throughputMBps: 2 }, [B]: { throughputMBps: 3 }, [C]: { throughputMBps: 5 } },
      10 * MB
    )
    expect(plan.targets.map(t => t.server)).toEqual([C, A, B])
    expect(plan.targets[0].method).toBe('upload')
    expect(plan.targets[1].method).toBe('mirror')
  })

  it('keeps the user order when the difference is small', () => {
    const plan = planUpload(
      [A, B],
      { [A]: { throughputMBps: 4 }, [B]: { throughputMBps: 6 } },
      10 * MB
    )
    expect(plan.targets[0].server).toBe(A)
  })

  it('never reorders on an unmeasured first server', () => {
    const plan = planUpload([A, B], { [B]: { throughputMBps: 50 } }, 10 * MB)
    expect(plan.targets[0].server).toBe(A)
  })

  it('normalizes and deduplicates server URLs', () => {
    const plan = planUpload([`${A}/`, 'HTTPS://A.EXAMPLE', B], {}, MB)
    expect(plan.targets.map(t => t.server)).toEqual([A, B])
  })

  it('returns an empty plan for an empty list', () => {
    expect(planUpload([], {}, MB)).toEqual({ targets: [], skipped: [] })
  })
})
