import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSegmentAvailability } from './useSegmentAvailability'
import type { BlossomServer } from '@/contexts/AppContext'

const SHA_A = '1111111111111111111111111111111111111111111111111111111111111111'
const SHA_B = '2222222222222222222222222222222222222222222222222222222222222222'
const segments = [`https://origin.example/${SHA_A}.m4s`, `https://origin.example/${SHA_B}.m4s`]
const servers: BlossomServer[] = [
  { url: 'https://origin.example', name: 'origin', tags: [] },
  { url: 'https://mirror.example', name: 'mirror', tags: [] },
]

let requested: string[] = []

function stubFetch(deadHosts: string[]) {
  requested = []
  vi.stubGlobal('fetch', async (input: string) => {
    requested.push(input)
    return deadHosts.some(host => input.startsWith(host))
      ? new Response(null, { status: 404 })
      : new Response(null, { status: 200 })
  })
}

describe('useSegmentAvailability', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('checks each segment once even when callers pass fresh arrays every render', async () => {
    stubFetch([])
    const { result, rerender } = renderHook(
      ({ urls, blossomServers }) => useSegmentAvailability(urls, true, blossomServers),
      { initialProps: { urls: [...segments], blossomServers: [...servers] } }
    )

    await waitFor(() => expect(result.current).toEqual(['available', 'available']))

    // Same values, new array identities — what the debug dialog renders. A
    // restart here aborted every in-flight check and looped forever.
    rerender({ urls: [...segments], blossomServers: [...servers] })
    rerender({ urls: [...segments], blossomServers: [...servers] })

    expect(requested).toEqual(segments)
    expect(result.current).toEqual(['available', 'available'])
  })

  it('reports segments missing on their own server but present on a mirror', async () => {
    stubFetch(['https://origin.example'])
    const { result } = renderHook(() => useSegmentAvailability(segments, true, servers))

    await waitFor(() => expect(result.current).toEqual(['mirrored', 'mirrored']))
    expect(requested).toContain(`https://mirror.example/${SHA_A}.m4s`)
  })

  it('reports segments no configured server holds', async () => {
    stubFetch(['https://origin.example', 'https://mirror.example'])
    const { result } = renderHook(() => useSegmentAvailability(segments, true, servers))

    await waitFor(() => expect(result.current).toEqual(['unavailable', 'unavailable']))
  })

  it('issues no requests while disabled', async () => {
    stubFetch([])
    renderHook(() => useSegmentAvailability(segments, false, servers))

    await waitFor(() => expect(requested).toEqual([]))
  })
})
