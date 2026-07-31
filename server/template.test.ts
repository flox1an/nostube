import { describe, expect, it } from 'vitest'

import { injectMeta } from './template'

describe('injectMeta', () => {
  it('escapes untrusted event titles before inserting them into HTML', () => {
    const html = '<html><head><title>safe</title></head><body></body></html>'
    const title = '</title><script>alert(1)</script>'

    const result = injectMeta(html, '', title)

    expect(result).not.toContain('<script>alert(1)</script>')
    expect(result).toContain(
      '<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; - nostube</title>'
    )
  })
})
