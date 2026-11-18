import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAPABILITY_TTL_MS,
  getServerCapabilities,
  parseSizeLabel,
  recordMirrorResult,
  recordThroughput,
  recordTooLarge,
} from './server-capabilities'

const SERVER = 'https://blossom.example'
const MB = 1024 * 1024

describe('parseSizeLabel', () => {
  it('parses catalog sizes', () => {
    expect(parseSizeLabel('100MB')).toBe(100 * MB)
    expect(parseSizeLabel('1.5 GB')).toBe(1.5 * 1024 * MB)
  })

  it('returns undefined for missing or unknown labels', () => {
    expect(parseSizeLabel(undefined)).toBeUndefined()
    expect(parseSizeLabel('unlimited')).toBeUndefined()
  })
})

describe('server capabilities', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('takes size limits and mirror support from the catalog', () => {
    const caps = getServerCapabilities(['https://24242.io/'])
    expect(caps['https://24242.io'].maxFileSize).toBe(100 * MB)
    expect(caps['https://24242.io'].mirror).toBe(false)
  })

  it('knows nothing about an unknown server', () => {
    expect(getServerCapabilities([SERVER])[SERVER]).toEqual({})
  })

  it('learns mirror support from a successful mirror', () => {
    recordMirrorResult(SERVER, { ok: true })
    expect(getServerCapabilities([SERVER])[SERVER].mirror).toBe(true)
  })

  it('learns missing mirror support from 404, 405 and 501', () => {
    for (const status of [404, 405, 501]) {
      localStorage.clear()
      recordMirrorResult(SERVER, { status })
      expect(getServerCapabilities([SERVER])[SERVER].mirror).toBe(false)
    }
  })

  it('ignores failures that say nothing about mirror support', () => {
    recordMirrorResult(SERVER, { status: 500 })
    recordMirrorResult(SERVER, { status: 401 })
    expect(getServerCapabilities([SERVER])[SERVER].mirror).toBeUndefined()
  })

  it('lets learned facts override the catalog', () => {
    recordMirrorResult('https://24242.io', { ok: true })
    expect(getServerCapabilities(['https://24242.io'])['https://24242.io'].mirror).toBe(true)
  })

  it('lowers the size limit after a 413', () => {
    recordTooLarge(SERVER, 300 * MB)
    recordTooLarge(SERVER, 500 * MB)
    expect(getServerCapabilities([SERVER])[SERVER].maxFileSize).toBe(300 * MB - 1)
  })

  it('averages throughput and ignores small transfers', () => {
    recordThroughput(SERVER, MB, 1)
    expect(getServerCapabilities([SERVER])[SERVER].throughputMBps).toBeUndefined()
    recordThroughput(SERVER, 100 * MB, 10)
    recordThroughput(SERVER, 100 * MB, 5)
    expect(getServerCapabilities([SERVER])[SERVER].throughputMBps).toBeCloseTo(13)
  })

  it('forgets learned facts after the TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01'))
    recordMirrorResult(SERVER, { status: 405 })
    vi.setSystemTime(Date.now() + CAPABILITY_TTL_MS + 1)
    expect(getServerCapabilities([SERVER])[SERVER].mirror).toBeUndefined()
  })
})
