import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { BlobDescriptor } from 'blossom-client-sdk'
import { useFileUpload, type FileUploadOptions } from './useFileUpload'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpload = vi.fn()
const mockMirror = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/blossom-upload', () => ({
  uploadFileToMultipleServersChunked: (...args: unknown[]) => mockUpload(...args),
  mirrorBlobsToServers: (...args: unknown[]) => mockMirror(...args),
  deleteBlobsFromServers: (...args: unknown[]) => mockDelete(...args),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlob(overrides: Partial<BlobDescriptor> = {}): BlobDescriptor {
  return {
    url: 'https://server1.example/abc123',
    sha256: 'abc123',
    size: 1024,
    type: 'video/mp4',
    uploaded: Date.now(),
    ...overrides,
  }
}

const fakeSigner = vi.fn()

function defaultOptions(overrides: Partial<FileUploadOptions> = {}): FileUploadOptions {
  return {
    initialServers: ['https://server1.example'],
    signer: fakeSigner,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useFileUpload(defaultOptions()))

    expect(result.current.uploading).toBe(false)
    expect(result.current.progress).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('uploads and mirrors successfully', async () => {
    const uploadedBlob = makeBlob()
    const mirroredBlob = makeBlob({ url: 'https://mirror.example/abc123' })

    mockUpload.mockResolvedValueOnce([uploadedBlob])
    mockMirror.mockResolvedValueOnce([mirroredBlob])

    const { result } = renderHook(() =>
      useFileUpload(
        defaultOptions({
          mirrorServers: ['https://mirror.example'],
        })
      )
    )

    const file = new File(['hello'], 'test.mp4', { type: 'video/mp4' })

    let uploadResult: Awaited<ReturnType<typeof result.current.upload>> | undefined

    await act(async () => {
      uploadResult = await result.current.upload(file)
    })

    // Verify upload was called with correct params
    expect(mockUpload).toHaveBeenCalledOnce()
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        servers: ['https://server1.example'],
        signer: fakeSigner,
      })
    )

    // Verify mirror was called
    expect(mockMirror).toHaveBeenCalledOnce()
    expect(mockMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        mirrorServers: ['https://mirror.example'],
        blob: uploadedBlob,
        signer: fakeSigner,
      })
    )

    // Verify result
    expect(uploadResult).toEqual({
      uploadedBlobs: [uploadedBlob],
      mirroredBlobs: [mirroredBlob],
    })

    // State should be settled
    expect(result.current.uploading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error and re-throws on upload failure', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Network failed'))

    const { result } = renderHook(() => useFileUpload(defaultOptions()))
    const file = new File(['data'], 'fail.mp4', { type: 'video/mp4' })

    let caught: Error | undefined

    await act(async () => {
      try {
        await result.current.upload(file)
      } catch (err) {
        caught = err as Error
      }
    })

    expect(caught).toBeInstanceOf(Error)
    expect(caught?.message).toBe('Network failed')
    expect(result.current.error).toBe('Network failed')
    expect(result.current.uploading).toBe(false)
  })

  it('skips mirror when no mirror servers configured', async () => {
    const uploadedBlob = makeBlob()
    mockUpload.mockResolvedValueOnce([uploadedBlob])

    const { result } = renderHook(() => useFileUpload(defaultOptions()))
    const file = new File(['data'], 'test.mp4', { type: 'video/mp4' })

    let uploadResult: Awaited<ReturnType<typeof result.current.upload>> | undefined

    await act(async () => {
      uploadResult = await result.current.upload(file)
    })

    expect(mockMirror).not.toHaveBeenCalled()
    expect(uploadResult).toEqual({
      uploadedBlobs: [uploadedBlob],
      mirroredBlobs: [],
    })
  })

  it('deletes blobs', async () => {
    mockDelete.mockResolvedValueOnce({ totalSuccessful: 1, totalFailed: 0 })

    const { result } = renderHook(() => useFileUpload(defaultOptions()))
    const blobs = [makeBlob()]

    await act(async () => {
      await result.current.deleteBlobs(blobs)
    })

    expect(mockDelete).toHaveBeenCalledOnce()
    expect(mockDelete).toHaveBeenCalledWith(blobs, fakeSigner)
  })

  it('skips delete when blobs array is empty', async () => {
    const { result } = renderHook(() => useFileUpload(defaultOptions()))

    await act(async () => {
      await result.current.deleteBlobs([])
    })

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('reset clears all state', async () => {
    mockUpload.mockRejectedValueOnce(new Error('fail'))

    const { result } = renderHook(() => useFileUpload(defaultOptions()))
    const file = new File(['data'], 'test.mp4', { type: 'video/mp4' })

    // Trigger an error so state is dirty
    await act(async () => {
      try {
        await result.current.upload(file)
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBe('fail')

    act(() => {
      result.current.reset()
    })

    expect(result.current.uploading).toBe(false)
    expect(result.current.progress).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
