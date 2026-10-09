// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SignedEvent } from '../signer'
import { UploadError, uploadBlob } from './blossom-upload'

const HASH = 'a'.repeat(64)
const descriptor = (patch: object = {}) => ({
  url: `https://videos.example.org/${HASH}.mp4`,
  sha256: HASH,
  size: 10,
  type: 'video/mp4',
  ...patch,
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sign = vi.fn(async (t: object) => ({ ...t, id: 'i', pubkey: 'p', sig: 's' }) as SignedEvent)

const run = (file: Blob, fetchImpl: typeof fetch, extra: object = {}) =>
  uploadBlob({
    file,
    fileName: 'clip.mp4',
    sha256: HASH,
    type: 'video/mp4',
    sign,
    fetchImpl,
    retryDelayMs: 0,
    ...extra,
  })

describe('uploadBlob', () => {
  it('puts a small file in one request, authorised for its hash', async () => {
    sign.mockClear()
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return json(descriptor())
    }) as unknown as typeof fetch
    const progress: number[] = []
    const result = await run(new Blob(['0123456789']), fetchImpl, {
      onProgress: (s: number) => progress.push(s),
    })
    expect(result.url).toBe(`https://videos.example.org/${HASH}.mp4`)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/upload')
    expect(calls[0].init.method).toBe('PUT')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-SHA-256']).toBe(HASH)
    expect(headers['Content-Type']).toBe('video/mp4')
    expect(headers.Authorization.startsWith('Nostr ')).toBe(true)
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign.mock.calls[0][0]).toMatchObject({ kind: 24242 })
    expect(progress[progress.length - 1]).toBe(10)
  })

  it('sends a larger file in pieces with one authorisation and reports the offsets', async () => {
    sign.mockClear()
    const seen: { offset: string; length: number; type: string; total: string }[] = []
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>
      seen.push({
        offset: h['Upload-Offset'],
        length: (init.body as Blob).size,
        type: h['Upload-Type'],
        total: h['Upload-Length'],
      })
      expect(init.method).toBe('PATCH')
      expect(h['Content-Type']).toBe('application/octet-stream')
      return h['Upload-Offset'] === '8'
        ? json(descriptor({ size: 10 }))
        : new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const progress: number[] = []
    const result = await run(new Blob(['0123456789']), fetchImpl, {
      chunkSize: 4,
      onProgress: (s: number) => progress.push(s),
    })
    expect(result.sha256).toBe(HASH)
    expect(seen).toEqual([
      { offset: '0', length: 4, type: 'video/mp4', total: '10' },
      { offset: '4', length: 4, type: 'video/mp4', total: '10' },
      { offset: '8', length: 2, type: 'video/mp4', total: '10' },
    ])
    expect(sign).toHaveBeenCalledTimes(1)
    expect(progress).toEqual([4, 8, 10])
  })

  it('refuses an answer for a different file', async () => {
    const fetchImpl = (async () =>
      json(descriptor({ sha256: 'b'.repeat(64) }))) as unknown as typeof fetch
    await expect(run(new Blob(['x']), fetchImpl)).rejects.toThrow(/hashes differ/)
  })

  it('does not retry when the server says no, and passes its reason on', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('Pubkey is not allowed to upload', { status: 403 })
    )
    await expect(run(new Blob(['x']), fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /not allowed to upload/
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('retries a server hiccup and a dropped connection, then gives up', async () => {
    let n = 0
    const flaky = (async () => {
      n++
      if (n === 1) throw new TypeError('network')
      if (n === 2) return new Response('busy', { status: 503 })
      return json(descriptor())
    }) as unknown as typeof fetch
    expect((await run(new Blob(['x']), flaky)).sha256).toBe(HASH)
    expect(n).toBe(3)

    const down = vi.fn(async () => new Response('down', { status: 502 }))
    const error = await run(new Blob(['x']), down as unknown as typeof fetch).catch(e => e)
    expect(error).toBeInstanceOf(UploadError)
    expect(down).toHaveBeenCalledTimes(3)
  })

  it('fails when the last piece does not complete the upload', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch
    await expect(run(new Blob(['0123456789']), fetchImpl, { chunkSize: 4 })).rejects.toThrow(
      /did not finish/
    )
  })

  describe('resuming a chunked upload', () => {
    const pieces = (offsets: string[]) =>
      (async (_url: string, init: RequestInit) => {
        const offset = (init.headers as Record<string, string>)['Upload-Offset']
        offsets.push(offset)
        return offset === '8' ? json(descriptor()) : new Response(null, { status: 204 })
      }) as unknown as typeof fetch

    it('continues at the offset it is given and reports where it got to', async () => {
      const offsets: string[] = []
      const reported: number[] = []
      await run(new Blob(['0123456789']), pieces(offsets), {
        chunkSize: 4,
        resumeFrom: 4,
        onOffset: (o: number) => reported.push(o),
      })
      expect(offsets).toEqual(['4', '8'])
      expect(reported).toEqual([8, 10])
    })

    it('counts a piece the server already has (409, existing session) as sent and goes on', async () => {
      const offsets: string[] = []
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        const offset = (init.headers as Record<string, string>)['Upload-Offset']
        offsets.push(offset)
        if (offset === '4')
          return new Response('Chunk conflicts with an existing session', { status: 409 })
        return offset === '8' ? json(descriptor()) : new Response(null, { status: 204 })
      }) as unknown as typeof fetch
      const result = await run(new Blob(['0123456789']), fetchImpl, { chunkSize: 4 })
      expect(result.sha256).toBe(HASH)
      expect(offsets).toEqual(['0', '4', '8']) // no retry of the 409
    })

    it('does not mistake another 409 (no room for a session) for a piece that is there', async () => {
      const fetchImpl = (async () =>
        new Response('Session capacity exhausted', { status: 409 })) as unknown as typeof fetch
      await expect(run(new Blob(['0123456789']), fetchImpl, { chunkSize: 4 })).rejects.toThrow(
        /capacity/
      )
    })

    it('starts over (offset 0) when the last piece does not complete the upload', async () => {
      const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch
      const reported: number[] = []
      await expect(
        run(new Blob(['0123456789']), fetchImpl, {
          chunkSize: 4,
          resumeFrom: 4,
          onOffset: (o: number) => reported.push(o),
        })
      ).rejects.toThrow(/did not finish/)
      expect(reported[reported.length - 1]).toBe(0)
    })

    it('begins at the start when the offset is already the end of the file', async () => {
      const offsets: string[] = []
      await run(new Blob(['0123456789']), pieces(offsets), { chunkSize: 4, resumeFrom: 10 })
      expect(offsets[0]).toBe('0')
    })
  })
})
