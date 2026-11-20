import { describe, expect, it } from 'vitest'
import { describeUploadError } from './upload-error'

// Interpolates {{x}} in the default value, which is all describeUploadError relies on.
const t = ((_key: string, options: { defaultValue: string; [k: string]: unknown }) =>
  options.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options[name]))) as never

describe('describeUploadError', () => {
  it('names the server for a network failure', () => {
    const error = new Error('blossom.primal.net: Failed to fetch')
    expect(describeUploadError(error, t)).toBe(
      'blossom.primal.net could not be reached. Check your connection or choose another server.'
    )
  })

  it('names the server when it rejects a file as too large', () => {
    const error = new Error('nostr.download: Regular upload failed: 413 Payload Too Large')
    expect(describeUploadError(error, t)).toContain(
      'nostr.download does not accept files this large'
    )
  })

  it('reports a timeout by error name', () => {
    const error = Object.assign(new Error('almond.slidestr.net: No response'), {
      name: 'TimeoutError',
    })
    expect(describeUploadError(error, t)).toContain('almond.slidestr.net did not respond in time')
  })

  it('keeps an unrecognised message instead of hiding it', () => {
    expect(describeUploadError(new Error('Hash mismatch'), t)).toBe('Hash mismatch')
  })

  it('does not call an unrelated TypeError a network problem', () => {
    expect(describeUploadError(new TypeError('x is not a function'), t)).toBe('x is not a function')
  })
})
