import { describe, expect, it, vi } from 'vitest'
import type { NostrEvent } from 'nostr-tools'
import { runVideoEdit, type VideoEditInput, type VideoEditCache } from './run-video-edit'
import type { UploadDeps } from './run-upload'

const author = 'a'.repeat(64)
const event: NostrEvent = {
  id: 'b'.repeat(64),
  pubkey: author,
  sig: 'c'.repeat(128),
  kind: 34235,
  created_at: 200,
  content: 'Old',
  tags: [
    ['d', 'stable'],
    ['imeta', 'url https://media/old.mp4'],
  ],
}
const input: VideoEditInput = { title: 'Updated', description: 'Description', tags: [] }
function deps(): UploadDeps {
  return {
    probe: vi.fn().mockResolvedValue({ width: 720, height: 1280, duration: 9 }),
    convert: vi.fn(),
    hash: vi.fn().mockResolvedValue('newhash'),
    upload: vi.fn().mockResolvedValue({
      url: 'https://media/new.mp4',
      sha256: 'newhash',
      size: 3,
      type: 'video/mp4',
    }),
    prepareMedia: vi.fn(async template => template),
    publish: vi
      .fn()
      .mockResolvedValue({ eventId: 'accepted', link: 'link', accepted: ['wss://relay'] }),
    newIdentifier: vi.fn(),
  }
}

describe('editing published videos', () => {
  it('publishes metadata without probing, hashing or uploading unchanged media', async () => {
    const dependencies = deps()
    await runVideoEdit(() => event, author, input, dependencies, new Map())
    expect(dependencies.probe).not.toHaveBeenCalled()
    expect(dependencies.hash).not.toHaveBeenCalled()
    expect(dependencies.upload).not.toHaveBeenCalled()
    expect(dependencies.publish).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 34235, content: 'Description' })
    )
  })

  it('retains the upload on relay refusal and retries publishing with the latest event', async () => {
    const dependencies = deps()
    vi.mocked(dependencies.publish).mockRejectedValueOnce(new Error('Relay refused'))
    const file = new File(['new'], 'new.mp4', { type: 'video/mp4' })
    const cache: VideoEditCache = new Map()
    const changed = { ...input, file }
    await expect(runVideoEdit(() => event, author, changed, dependencies, cache)).rejects.toThrow(
      'Relay refused'
    )
    const latest = { ...event, id: 'd'.repeat(64), created_at: 2_000_000_000 }
    await runVideoEdit(() => latest, author, changed, dependencies, cache)
    expect(dependencies.upload).toHaveBeenCalledTimes(1)
    expect(dependencies.hash).toHaveBeenCalledTimes(1)
    const template = vi.mocked(dependencies.publish).mock.calls[1][0]
    expect(template.created_at).toBe(2_000_000_001)
    expect(template.kind).toBe(34235)
    expect(template.tags).toContainEqual(['d', 'stable'])
    expect(template.tags.find(tag => tag[0] === 'imeta')).toContain('size 3')
    expect(template.tags.find(tag => tag[0] === 'imeta')).toContain('x newhash')
  })

  it('uploads only changed thumbnail/subtitle files and preserves existing tracks across retries', async () => {
    const dependencies = deps()
    vi.mocked(dependencies.publish).mockRejectedValueOnce(new Error('Relay refused'))
    const thumbnail = new Blob(['image'], { type: 'image/jpeg' })
    const subtitle = new File(['WEBVTT\n'], 'new.vtt', { type: 'text/vtt' })
    const cache: VideoEditCache = new Map()
    const changed = {
      ...input,
      thumbnail,
      subtitles: [
        { id: 'old', lang: 'en', url: 'https://media/old.vtt', extra: ['captions'] },
        { id: 'new', lang: 'de', file: subtitle },
      ],
    }
    await expect(runVideoEdit(() => event, author, changed, dependencies, cache)).rejects.toThrow(
      'Relay refused'
    )
    await runVideoEdit(
      () => event,
      author,
      { ...changed, title: 'Retry title' },
      dependencies,
      cache
    )
    expect(dependencies.upload).toHaveBeenCalledTimes(2)
    expect(dependencies.hash).toHaveBeenCalledTimes(2)
    expect(dependencies.probe).not.toHaveBeenCalled()
    const template = vi.mocked(dependencies.publish).mock.calls[1][0]
    expect(template.tags).toContainEqual(['text-track', 'https://media/old.vtt', 'en', 'captions'])
    expect(template.tags).toContainEqual(['title', 'Retry title'])
  })

  it('uses the latest event after waiting for mirrors instead of overwriting a concurrent edit', async () => {
    const dependencies = deps()
    let current = event
    vi.mocked(dependencies.prepareMedia).mockImplementationOnce(async template => {
      current = {
        ...event,
        id: 'd'.repeat(64),
        created_at: 2_000_000_000,
        tags: [...event.tags, ['subject', 'concurrent']],
      }
      return template
    })
    await runVideoEdit(() => current, author, input, dependencies, new Map())
    const published = vi.mocked(dependencies.publish).mock.calls[0][0]
    expect(published.created_at).toBe(2_000_000_001)
    expect(published.tags).toContainEqual(['subject', 'concurrent'])
  })

  it('refuses non-owner edits before any uploads or publication', async () => {
    const dependencies = deps()
    await expect(
      runVideoEdit(() => event, 'other', input, dependencies, new Map())
    ).rejects.toThrow('authorMismatch')
    expect(dependencies.upload).not.toHaveBeenCalled()
    expect(dependencies.publish).not.toHaveBeenCalled()
  })
})
