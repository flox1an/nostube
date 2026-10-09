import { describe, expect, it, vi } from 'vitest'
import { blossomServerCandidates, fetchPlaylistWithFallback } from './hls-playlist-fetch'

describe('blossomServerCandidates', () => {
  const sha = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

  it('keeps the requested URL first and rewrites the hash onto every server', () => {
    expect(
      blossomServerCandidates(`https://origin.example/${sha}.m4s`, [
        { url: 'https://origin.example', name: 'origin', tags: [] },
        { url: 'https://mirror.example/', name: 'mirror', tags: [] },
      ])
    ).toEqual([`https://origin.example/${sha}.m4s`, `https://mirror.example/${sha}.m4s`])
  })

  it('returns only the URL when it carries no Blossom hash', () => {
    expect(
      blossomServerCandidates('https://origin.example/segment-3.ts', [
        { url: 'https://mirror.example', name: 'mirror', tags: [] },
      ])
    ).toEqual(['https://origin.example/segment-3.ts'])
  })
})

describe('fetchPlaylistWithFallback', () => {
  const sha = '3751b84f27234fc8ce3227d132b422f7e00f4a50c6cdc322080fed89a302d7dd'
  const dead = `https://dead.example/${sha}.m3u8`

  it('serves the playlist from a configured server when the origin is down', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: string) => {
      requested.push(input)
      return input.startsWith('https://dead.example')
        ? new Response('unavailable', { status: 503 })
        : new Response('#EXTM3U\n720p.m3u8\n', { status: 200 })
    })

    const result = await fetchPlaylistWithFallback(dead, [
      { url: 'https://mirror.example', name: 'mirror', tags: [] },
      { url: 'https://other.example/', name: 'other', tags: [] },
    ])

    // Stops at the first server that answers, and reports the URL that served
    // it so relative variant/segment URIs resolve against that server.
    expect(requested).toEqual([dead, `https://mirror.example/${sha}.m3u8`])
    expect(result.url).toBe(`https://mirror.example/${sha}.m3u8`)
    expect(result.text).toContain('#EXTM3U')
  })

  it('rejects with the last failure when no candidate answers', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }))

    await expect(fetchPlaylistWithFallback(dead, [])).rejects.toThrow('HTTP 404')
  })
})
