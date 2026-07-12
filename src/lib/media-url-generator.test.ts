import { describe, expect, it } from 'vitest'
import { generateMediaUrls } from './media-url-generator'

const hash = '161734deb1ac5581dd33f5552b65370b0a78ec7198d7c41b7e1fdddc34b1c550'
const localEventUrl = `http://127.0.0.1:3000/${hash}.mp4`

describe('generateMediaUrls', () => {
  it('does not return a private event origin or pass it to a remote proxy', () => {
    const generated = generateMediaUrls({
      urls: [localEventUrl],
      mediaType: 'video',
      proxyConfig: { enabled: true },
      cachingServers: [
        { name: 'remote', url: 'https://cache.example.com' },
        { name: 'local', url: 'http://127.0.0.1:24242' },
      ],
      blossomServers: [{ name: 'mirror', url: 'https://mirror.example.com', tags: ['mirror'] }],
    })

    expect(generated.urls).not.toContain(localEventUrl)
    expect(generated.urls.some(url => url.startsWith(`http://127.0.0.1:24242/${hash}.mp4`))).toBe(
      true
    )
    expect(generated.urls).toContain(`https://mirror.example.com/${hash}.mp4`)

    const remoteProxy = generated.urls.find(url => url.startsWith('https://cache.example.com/'))
    expect(remoteProxy).toBeDefined()
    expect(new URL(remoteProxy!).searchParams.getAll('xs')).not.toContain('127.0.0.1')
  })
})
