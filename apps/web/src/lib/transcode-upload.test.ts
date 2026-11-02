import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePublications } from '@nostube/widgets/publication'
import type { BlobDescriptor } from '@/lib/blossom-auth'
import type { MirrorServerOutcome } from '@/lib/blossom-upload'
import { trackBlobActivity, uploadAndMirror } from './transcode-upload'

const mockUpload = vi.fn()
const mockMirror = vi.fn()

vi.mock('@/lib/blossom-upload', () => ({
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
