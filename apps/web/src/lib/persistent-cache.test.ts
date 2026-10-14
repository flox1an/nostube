import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PersistentCache, clearAllPersistentCaches } from './persistent-cache'

describe('PersistentCache', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and reads values under a namespaced key', () => {
    const cache = new PersistentCache<{ a: number }>({ namespace: 'test' })
    cache.set('one', { a: 1 })

    expect(cache.get('one')).toEqual({ a: 1 })
    expect(localStorage.getItem('nostube:cache:test:one')).toBeTruthy()
    // Namespaced: nothing leaks into or out of other keys.
    expect(localStorage.getItem('unrelated')).toBeNull()
  })

  it('returns null and drops expired entries', () => {
    const cache = new PersistentCache<number>({ namespace: 'ttl', ttl: 1000 })
    cache.set('x', 42)
    expect(cache.get('x')).toBe(42)

    vi.advanceTimersByTime(1500)
    expect(cache.get('x')).toBeNull()
    expect(localStorage.getItem('nostube:cache:ttl:x')).toBeNull()
  })

  it('getStale returns expired values without dropping them', () => {
    const cache = new PersistentCache<number>({ namespace: 'stale', ttl: 1000 })
    cache.set('x', 42)
    vi.advanceTimersByTime(1500)

    expect(cache.getStale('x')).toBe(42)
    expect(localStorage.getItem('nostube:cache:stale:x')).toBeTruthy()
  })

  it('prunes oldest-written entries beyond maxEntries', () => {
    const cache = new PersistentCache<number>({ namespace: 'cap', maxEntries: 2 })
    cache.set('a', 1)
    vi.advanceTimersByTime(10)
    cache.set('b', 2)
    vi.advanceTimersByTime(10)
    cache.set('c', 3)

    expect(cache.get('a')).toBeNull()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.size()).toBe(2)
  })

  it('keeps namespaces isolated and reports keys', () => {
    const a = new PersistentCache<number>({ namespace: 'ns-a' })
    const b = new PersistentCache<number>({ namespace: 'ns-b' })
    a.set('x', 1)
    b.set('y', 2)

    expect(a.keys()).toEqual(['x'])
    expect(b.keys()).toEqual(['y'])
    a.delete('x')
    expect(a.get('x')).toBeNull()
    expect(b.get('y')).toBe(2)
  })

  it('treats unparseable entries as missing', () => {
    const cache = new PersistentCache<number>({ namespace: 'broken' })
    localStorage.setItem('nostube:cache:broken:x', 'not json')
    expect(cache.get('x')).toBeNull()
  })

  it('clearAllPersistentCaches clears only clearable caches', () => {
    const clearable = new PersistentCache<number>({ namespace: 'clear-me' })
    const keep = new PersistentCache<number>({ namespace: 'keep-me', clearable: false })
    clearable.set('x', 1)
    keep.set('y', 2)

    clearAllPersistentCaches()
    expect(clearable.get('x')).toBeNull()
    expect(keep.get('y')).toBe(2)
  })
})
