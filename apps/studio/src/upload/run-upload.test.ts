import { describe, expect, it, vi } from 'vitest'
import type { VideoProbe } from './probe-video'
import { isDone, newJob, runUpload, STEPS, type UploadDeps, type UploadJob } from './run-upload'

const HASH = 'a'.repeat(64)
const THUMB_HASH = 'b'.repeat(64)
const probe: VideoProbe = {
  width: 1920,
  height: 1080,
  duration: 61.2,
  thumbnail: new Blob(['jpeg']),
}
const file = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' })
const input = { file, title: 'A clip', description: 'About it', tags: ['travel'] }

function deps(overrides: Partial<UploadDeps> = {}) {
  const calls: string[] = []
  const d: UploadDeps = {
    probe: vi.fn(async () => (calls.push('probe'), probe)),
    hash: vi.fn(async blob => (calls.push('hash'), blob === probe.thumbnail ? THUMB_HASH : HASH)),
    upload: vi.fn(async ({ sha256, type }) => {
      calls.push(`upload:${type}`)
      return { url: `https://x.example/${sha256}`, sha256, size: 11, type }
    }),
    publish: vi.fn(async template => {
      calls.push('publish')
      expect(template.kind).toBe(34235)
      return { eventId: 'e'.repeat(64), link: 'naddr1xyz', accepted: ['wss://x.example'] }
    }),
    newIdentifier: () => 'clip-1',
    ...overrides,
  }
  return { d, calls }
}

const run = (job: UploadJob, d: UploadDeps) => runUpload(job, d, () => {})

describe('runUpload', () => {
  it('goes through every step in order and ends with the published video', async () => {
    const { d, calls } = deps()
    const seen: string[] = []
    const job = await runUpload(newJob(input, d), d, j =>
      STEPS.forEach(
        s => j.steps[s.id].status === 'running' && !seen.includes(s.id) && seen.push(s.id)
      )
    )
    expect(calls).toEqual([
      'probe',
      'hash',
      'upload:video/mp4',
      'hash',
      'upload:image/jpeg',
      'publish',
    ])
    expect(seen).toEqual(STEPS.map(s => s.id))
    expect(isDone(job)).toBe(true)
    expect(job.published?.link).toBe('naddr1xyz')
    expect(job.video?.sha256).toBe(HASH)
    expect(job.thumbnail?.sha256).toBe(THUMB_HASH)
  })

  it('skips the check when the file was probed on selection', async () => {
    const { d } = deps()
    const job = await run(newJob(input, d, probe), d)
    expect(d.probe).not.toHaveBeenCalled()
    expect(isDone(job)).toBe(true)
  })

  it('hashes the thumbnail itself and uploads it as an image', async () => {
    const { d } = deps()
    await run(newJob(input, d), d)
    const uploads = (d.upload as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])
    expect(uploads[1]).toMatchObject({
      name: 'thumbnail.jpg',
      type: 'image/jpeg',
      sha256: THUMB_HASH,
    })
  })

  it('stops at the first failing step with its message and leaves the later ones pending', async () => {
    const { d } = deps({
      probe: vi.fn(async () => Promise.reject(new Error('This browser cannot play the file.'))),
    })
    const job = await run(newJob(input, d), d)
    expect(job.steps.check).toMatchObject({
      status: 'error',
      error: 'This browser cannot play the file.',
    })
    expect(job.steps.hash.status).toBe('pending')
    expect(d.upload).not.toHaveBeenCalled()
  })

  it('continues after a failed publish without uploading again', async () => {
    let attempts = 0
    const { d } = deps({
      publish: vi.fn(async () => {
        if (++attempts === 1) throw new Error('blocked: not a writer')
        return { eventId: 'e'.repeat(64), link: 'naddr1xyz', accepted: ['wss://x.example'] }
      }),
    })
    const first = await run(newJob(input, d), d)
    expect(first.steps.publish).toMatchObject({ status: 'error', error: 'blocked: not a writer' })
    expect((d.upload as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)

    const second = await run(first, d)
    expect(isDone(second)).toBe(true)
    // The probe, the hashing and both uploads were not repeated.
    expect(d.probe).toHaveBeenCalledTimes(1)
    expect((d.upload as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
    expect(d.publish).toHaveBeenCalledTimes(2)
  })

  it('retries a failed video upload from there and keeps the hash', async () => {
    let attempts = 0
    const { d } = deps({
      upload: vi.fn(async ({ sha256, type }) => {
        if (type === 'video/mp4' && ++attempts === 1)
          throw new Error('The connection to the server failed.')
        return { url: `https://x.example/${sha256}`, sha256, size: 11, type }
      }),
    })
    const first = await run(newJob(input, d), d)
    expect(first.steps.video.status).toBe('error')
    expect(first.sha256).toBe(HASH)
    const second = await run(first, d)
    expect(isDone(second)).toBe(true)
    expect(d.hash).toHaveBeenCalledTimes(2) // the video once, the thumbnail once
  })

  it('remembers how far a large upload got and resumes from there on a retry', async () => {
    const resumeFrom: (number | undefined)[] = []
    let attempts = 0
    const { d } = deps({
      upload: vi.fn(async ({ sha256, type, resumeFrom: from, onOffset }) => {
        if (type === 'video/mp4') {
          resumeFrom.push(from)
          if (++attempts === 1) {
            onOffset?.(16)
            throw new Error('The connection to the server failed.')
          }
        }
        return { url: `https://x.example/${sha256}`, sha256, size: 11, type }
      }),
    })
    const first = await run(newJob(input, d), d)
    expect(first.videoOffset).toBe(16)
    await run(first, d)
    expect(resumeFrom).toEqual([undefined, 16])
  })

  it('publishes the description, tags and content warning the person entered', async () => {
    const { d } = deps()
    await run(newJob({ ...input, contentWarning: 'nudity' }, d), d)
    const template = (d.publish as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(template.tags).toContainEqual(['title', 'A clip'])
    expect(template.tags).toContainEqual(['t', 'travel'])
    expect(template.tags).toContainEqual(['content-warning', 'nudity'])
    expect(template.tags.find((t: string[]) => t[0] === 'd')).toEqual(['d', 'clip-1'])
  })
})
