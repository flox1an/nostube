import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { TestApp } from '@/test/TestApp'
import { useImageProxy } from './useImageProxy'
import { useProxyHealthStore } from '@/stores/proxyHealthStore'

const RAW_URL = 'https://blossom.example/cat.jpg'
const HASH = 'a'.repeat(64)
const BLOSSOM_URL = `https://origin.example/${HASH}.jpg`

describe('useImageProxy', () => {
  beforeEach(() => {
    useProxyHealthStore.getState().reset()
  })

  it('builds proxy URLs while the proxy status is unknown or up', () => {
    const { result } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    const previewSrc = result.current.preview(RAW_URL)
    expect(previewSrc).toContain('/insecure/')
    expect(previewSrc).toContain('/plain/')
    expect(previewSrc).toContain(encodeURIComponent(RAW_URL))
    expect(result.current.isProxyDown).toBe(false)
  })

  it('uses the Blossom endpoint with source, fallback, and author candidates', () => {
    const { result } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    const previewSrc = result.current.preview(BLOSSOM_URL, undefined, {
      authorPubkey: 'author-pubkey',
      fallbackUrls: [`https://fallback.example/${HASH}.jpg`],
    })
    const parsed = new URL(previewSrc)

    expect(parsed.pathname).toBe(`/thumb/${HASH}.jpg`)
    expect(parsed.searchParams.get('f')).toBe('webp')
    expect(parsed.searchParams.get('rs')).toBe('fit:480:480')
    expect(parsed.searchParams.get('as')).toBe('author-pubkey')
    expect(parsed.searchParams.getAll('xs')).toEqual([
      'https://origin.example',
      'https://fallback.example',
    ])
  })

  it('uses the Blossom endpoint for a bare hash', () => {
    const { result } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    const previewSrc = result.current.preview(`https://origin.example/${HASH}`)

    expect(new URL(previewSrc).pathname).toBe(`/thumb/${HASH}`)
  })

  it('returns the raw URL once the proxy status flips to down', () => {
    const { result, rerender } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    act(() => {
      useProxyHealthStore.getState().markDown()
    })
    rerender()

    expect(result.current.isProxyDown).toBe(true)
    expect(result.current.preview(RAW_URL)).toBe(RAW_URL)
    expect(result.current.avatar(RAW_URL)).toBe(RAW_URL)
    expect(result.current.inline(RAW_URL)).toBe(RAW_URL)
  })

  it('returns empty string from videoThumbnail when the proxy is down (no client-side equivalent)', () => {
    const { result, rerender } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    act(() => {
      useProxyHealthStore.getState().markDown()
    })
    rerender()

    expect(result.current.videoThumbnail('https://blossom.example/cat.mp4')).toBe('')
  })

  it('reportFailure feeds the breaker and reportSuccess clears it', () => {
    const { result } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    act(() => {
      for (let i = 0; i < 5; i++) result.current.reportFailure(RAW_URL)
    })
    expect(useProxyHealthStore.getState().status).toBe('down')

    act(() => {
      result.current.reportSuccess()
    })
    expect(useProxyHealthStore.getState().status).toBe('up')
  })

  it('reportFailure recovers the raw URL even when handed the already-proxified version', () => {
    const { result } = renderHook(() => useImageProxy(), { wrapper: TestApp })

    const proxied = result.current.preview(RAW_URL)
    act(() => {
      result.current.reportFailure(proxied)
    })

    expect(useProxyHealthStore.getState().lastFailedUrl).toBe(RAW_URL)
  })
})
