import { describe, expect, it } from 'vitest'
import type { BlossomServer } from '@nostube/core'
import {
  mergeProfileServers,
  normalizeBlossomServers,
  removeServer,
  setServerUpload,
  uploadServerUrls,
} from './blossom-servers'

const server = (url: string, upload?: boolean): BlossomServer => ({
  url,
  name: url,
  tags: [],
  ...(upload === undefined ? {} : { upload }),
})

const list = [server('https://a'), server('https://b'), server('https://c')]

describe('upload server selection', () => {
  it('uploads only to servers that are switched on', () => {
    const next = setServerUpload(list, 'https://b', false)
    expect(uploadServerUrls(next)).toEqual(['https://a', 'https://c'])
  })

  it('keeps the switch when the stored list is cleaned up', () => {
    const next = normalizeBlossomServers(setServerUpload(list, 'https://b', false))
    expect(uploadServerUrls(next)).toEqual(['https://a', 'https://c'])
  })

  it('refuses to switch off the last active server', () => {
    const one = setServerUpload(setServerUpload(list, 'https://a', false), 'https://b', false)
    expect(setServerUpload(one, 'https://c', false)).toBe(one)
  })

  it('switches the first remaining server on when the last active one is removed', () => {
    const one = [server('https://a', false), server('https://b', false), server('https://c')]
    const next = removeServer(one, 'https://c')
    expect(next.map(s => s.url)).toEqual(['https://a', 'https://b'])
    expect(uploadServerUrls(next)).toEqual(['https://a'])
  })

  it('switches a server back on', () => {
    const off = setServerUpload(list, 'https://b', false)
    expect(setServerUpload(off, 'https://b', true)).toEqual(list)
  })
})

describe('mergeProfileServers', () => {
  it('adds servers from the profile list once', () => {
    const merged = mergeProfileServers([server('https://a')], ['https://a/', 'https://b/'], null)
    expect(merged?.servers.map(s => s.url)).toEqual(['https://a', 'https://b'])
  })

  it('does not bring back a server the user removed while the profile list is unchanged', () => {
    const first = mergeProfileServers([], ['https://a/', 'https://b/'], null)!
    const afterRemove = removeServer(first.servers, 'https://b')
    expect(mergeProfileServers(afterRemove, ['https://b/', 'https://a/'], first.signature)).toBe(
      null
    )
  })

  it('merges again when the profile list changes', () => {
    const first = mergeProfileServers([], ['https://a/'], null)!
    const next = mergeProfileServers(first.servers, ['https://a/', 'https://c/'], first.signature)
    expect(next?.servers.map(s => s.url)).toEqual(['https://a', 'https://c'])
  })
})
