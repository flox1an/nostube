import { describe, expect, it } from 'vitest'
import { neutralizeBranding } from './branding'

describe('neutralizeBranding', () => {
  it('replaces the nostube names in the title and the meta tags', () => {
    document.head.innerHTML = `<title>Nostube Embed Player</title>
      <meta name="description" content="Nostube embeddable video player for Nostr video content">
      <meta property="og:title" content="Nostube Embed Player">
      <meta property="og:description" content="Embed Nostube videos">`
    neutralizeBranding(document)
    expect(document.head.innerHTML.toLowerCase()).not.toContain('nostube')
    expect(document.title).toBe('Video player')
  })

  it('is fine with a head that has none of these tags', () => {
    document.head.innerHTML = '<title>x</title>'
    expect(() => neutralizeBranding(document)).not.toThrow()
  })
})
