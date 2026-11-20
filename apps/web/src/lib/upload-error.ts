import type { TFunction } from 'i18next'

/**
 * Plain-language text for a failed upload or processing job. Recognised network, server and
 * file problems name the server (the message starts with its host, see
 * `uploadToServersChunked`) and say what to do next; anything else keeps its own message.
 */
export function describeUploadError(error: unknown, t: TFunction): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const name = error instanceof Error ? error.name : ''
  const host = /^([^\s:/]+\.[^\s:/]+): /.exec(raw)?.[1]
  const server = host ?? t('upload.error.anyServer', { defaultValue: 'The server' })

  if (name === 'NotReadableError' || raw.includes('NotReadableError')) {
    return t('upload.error.notReadable', {
      defaultValue:
        'The browser cannot read this file. Very large or damaged files cause this; try another file or browser.',
    })
  }
  if (raw.includes('File too large for browser')) {
    return t('upload.error.fileTooLarge', {
      defaultValue:
        'This file is too large for the browser to process. Try a smaller file or close other tabs.',
    })
  }
  if (/\b413\b/.test(raw)) {
    return t('upload.error.serverTooLarge', {
      server,
      defaultValue:
        '{{server}} does not accept files this large. Choose another server or a smaller file.',
    })
  }
  if (/\b(401|403)\b/.test(raw)) {
    return t('upload.error.refused', {
      server,
      defaultValue: '{{server}} refused the upload. It may need an account or not accept your key.',
    })
  }
  if (name === 'TimeoutError' || raw.includes('No response from')) {
    return t('upload.error.timeout', {
      server,
      defaultValue: '{{server}} did not respond in time. Try again or choose another server.',
    })
  }
  if (raw.includes('PATCH') || raw.includes('BUD-10') || raw.includes('OPTIONS /upload')) {
    return t('upload.error.chunked', {
      server,
      defaultValue: '{{server}} does not support large uploads. Choose another server.',
    })
  }
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return t('upload.error.unreachable', {
      server,
      defaultValue:
        '{{server}} could not be reached. Check your connection or choose another server.',
    })
  }
  return raw
}
