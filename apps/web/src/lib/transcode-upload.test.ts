import { beforeEach, describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePublications } from '@nostube/widgets/publication'
import type { BlobDescriptor } from '@/lib/blossom-auth'
import type * as BlossomUpload from '@/lib/blossom-upload'
import type { MirrorServerOutcome } from '@/lib/blossom-upload'
import { getServerCapabilities } from '@/lib/server-capabilities'
import { NoServerAcceptsFileError, trackBlobActivity, uploadAndMirror } from './transcode-upload'

const mockUpload = vi.fn()
const mockMirror = vi.fn()

vi.mock('@/lib/blossom-upload', async importOriginal => ({
  ...(await importOriginal<typeof BlossomUpload>()),
  uploadFileToMultipleServersChunked: (...args: unknown[]) => mockUpload(...args),
  mirrorBlobsToServers: (...args: unknown[]) => mockMirror(...args),
}))
vi.mock('@/lib/video-processing', () => ({ processUploadedVideo: vi.fn() }))

const blobOn = (server: string): BlobDescriptor => ({
  url: `${server}/abc`,
  sha256: 'abc',
  size: 10,
  type: 'video/mp4',
  uploaded: 0,
})

type Settle = {
  servers?: string[]
  mirrorServers?: string[]
  onServerSettle: (o: MirrorServerOutcome) => void
}

const confirmAll = async ({ servers, mirrorServers, onServerSettle }: Settle) =>
  (servers ?? mirrorServers ?? []).map(server => {
    onServerSettle({ ok: true, server, blob: blobOn(server), alreadyExisted: false })
    return blobOn(server)
  })

describe('trackBlobActivity', () => {
  it('reports per-server outcomes and retries only the failed mirror', async () => {
    mockUpload.mockImplementationOnce(confirmAll)
    mockMirror.mockImplementationOnce(async ({ onServerSettle }: Settle) => {
      onServerSettle({
        ok: true,
        server: 'https://m1',
        blob: blobOn('https://m1'),
        alreadyExisted: false,
      })
      onServerSettle({
        ok: false,
        server: 'https://m2',
        error: new DOMException('slow', 'TimeoutError'),
      })
      return [blobOn('https://m1')]
    })
    const recovered = vi.fn()
    const { result } = renderHook(() => usePublications())

    await act(async () => {
      const activity = trackBlobActivity('retry.mp4', vi.fn(), { onMirrorRetry: recovered })
      await uploadAndMirror({
        file: new File(['x'], 'retry.mp4'),
        initialServers: ['https://u1'],
        mirrorServers: ['https://m1', 'https://m2'],
        activity,
      })
      activity.finish()
    })

    const partial = result.current.find(entry => entry.label === 'retry.mp4')!
    expect(partial.status).toBe('partial')
    expect(partial.targets).toEqual([
      { url: 'https://u1', status: 'confirmed' },
      { url: 'https://m1', status: 'confirmed' },
      { url: 'https://m2', status: 'timeout', message: 'slow' },
    ])
    expect([partial.completed, partial.total, partial.unit]).toEqual([10, 20, 'bytes'])

    mockMirror.mockImplementationOnce(confirmAll)
    await act(async () => {
      await partial.retry!()
    })

    expect(mockMirror).toHaveBeenLastCalledWith(
      expect.objectContaining({ mirrorServers: ['https://m2'] })
    )
    expect(recovered).toHaveBeenCalledWith([blobOn('https://m2')])
    const settled = result.current.find(entry => entry.label === 'retry.mp4')!
    expect(settled.status).toBe('success')
    expect(settled.retry).toBeUndefined()
    expect(settled.completed).toBe(20)
  })

  it('marks servers that never settled as failed and removes cancelled work', async () => {
    const { result } = renderHook(() => usePublications())

    act(() => {
      const stopped = trackBlobActivity('stopped.mp4', vi.fn())
      stopped.hold(['https://u1'])
      stopped.finish(new Error('disk full'))
      trackBlobActivity('cancelled.mp4', vi.fn()).finish(new DOMException('Aborted', 'AbortError'))
    })

    const stopped = result.current.find(entry => entry.label === 'stopped.mp4')!
    expect(stopped.status).toBe('failed')
    expect(stopped.error).toBe('disk full')
    expect(stopped.targets).toEqual([{ url: 'https://u1', status: 'failed' }])
    expect(result.current.some(entry => entry.label === 'cancelled.mp4')).toBe(false)
  })
})

describe('uploadAndMirror upload strategy', () => {
  beforeEach(() => {
    localStorage.clear()
    mockUpload.mockReset()
    mockMirror.mockReset()
  })

  const fileOfSize = (size: number) => {
    const file = new File(['x'], 'clip.mp4')
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  const run = (initialServers: string[], mirrorServers: string[], size = 1) =>
    uploadAndMirror({
      file: fileOfSize(size),
      initialServers,
      mirrorServers,
      activity: trackBlobActivity('clip.mp4', vi.fn()),
    })

  it('uploads to the first server only and mirrors to every other server', async () => {
    mockUpload.mockImplementation(confirmAll)
    mockMirror.mockImplementation(confirmAll)

    const result = await run(['https://u1', 'https://u2'], ['https://m1'])

    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(mockUpload.mock.calls[0][0].servers).toEqual(['https://u1'])
    expect(mockMirror.mock.calls[0][0].mirrorServers).toEqual(['https://u2', 'https://m1'])
    expect(result.uploadedBlobs).toEqual([blobOn('https://u1')])
    expect(result.mirroredBlobs).toHaveLength(2)
  })

  it('uploads directly to a server without a mirror endpoint and remembers it', async () => {
    mockUpload.mockImplementation(confirmAll)
    mockMirror.mockImplementation(async ({ onServerSettle }: Settle) => {
      const error = Object.assign(new Error('Mirror request failed: 405'), { status: 405 })
      onServerSettle({ ok: false, server: 'https://m1', error })
      return []
    })

    const result = await run(['https://u1'], ['https://m1'])

    expect(mockUpload.mock.calls[1][0].servers).toEqual(['https://m1'])
    expect(result.mirroredBlobs).toEqual([blobOn('https://m1')])
    expect(getServerCapabilities(['https://m1'])['https://m1'].mirror).toBe(false)

    // Next time the plan skips the mirror attempt and uploads to both servers at once.
    mockMirror.mockClear()
    await run(['https://u1'], ['https://m1'])
    expect(mockUpload.mock.lastCall![0].servers).toEqual(['https://u1', 'https://m1'])
    expect(mockMirror).not.toHaveBeenCalled()
  })

  const rejectAll = async ({ servers, onServerSettle }: Settle) => {
    const error = new Error('Regular upload failed: 500')
    for (const server of servers ?? []) onServerSettle({ ok: false, server, error })
    throw error
  }

  it('lets the next server take over when the primary fails', async () => {
    mockUpload.mockImplementationOnce(rejectAll).mockImplementation(confirmAll)
    mockMirror.mockImplementation(confirmAll)

    const result = await run(['https://u1'], ['https://m1', 'https://m2'])

    expect(mockUpload.mock.calls[1][0].servers).toEqual(['https://m1'])
    expect(mockMirror.mock.calls[0][0].mirrorServers).toEqual(['https://m2'])
    expect(result.uploadedBlobs).toEqual([blobOn('https://m1')])
  })

  it('fails only when every server failed', async () => {
    mockUpload.mockImplementation(rejectAll)

    await expect(run(['https://u1'], ['https://m1'])).rejects.toThrow('Regular upload failed: 500')
    expect(mockUpload).toHaveBeenCalledTimes(2)
  })

  it('keeps the primary upload when a fallback upload fails', async () => {
    mockUpload.mockImplementationOnce(confirmAll).mockImplementation(rejectAll)
    mockMirror.mockImplementation(async ({ onServerSettle }: Settle) => {
      const error = Object.assign(new Error('Mirror request failed: 405'), { status: 405 })
      onServerSettle({ ok: false, server: 'https://m1', error })
      return []
    })
    const { result: publications } = renderHook(() => usePublications())

    let uploaded: BlobDescriptor[] = []
    await act(async () => {
      const activity = trackBlobActivity('partial.mp4', vi.fn())
      const result = await uploadAndMirror({
        file: new File(['x'], 'partial.mp4'),
        initialServers: ['https://u1'],
        mirrorServers: ['https://m1'],
        activity,
      })
      uploaded = result.uploadedBlobs
      activity.finish()
    })

    expect(uploaded).toEqual([blobOn('https://u1')])
    const entry = publications.current.find(e => e.label === 'partial.mp4')!
    expect(entry.status).toBe('partial')
  })

  it('leaves out a server whose size limit the file exceeds', async () => {
    mockUpload.mockImplementation(confirmAll)
    mockMirror.mockImplementation(confirmAll)

    // 24242.io takes at most 100 MB (server catalog).
    await run(['https://24242.io'], ['https://m1'], 101 * 1024 * 1024)

    expect(mockUpload.mock.calls[0][0].servers).toEqual(['https://m1'])
    expect(mockMirror).not.toHaveBeenCalled()
  })

  it('fails clearly when no server accepts the file', async () => {
    await expect(run(['https://24242.io'], [], 101 * 1024 * 1024)).rejects.toBeInstanceOf(
      NoServerAcceptsFileError
    )
  })
})
