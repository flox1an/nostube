import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n/config'
import ShareButton from '@nostube/widgets/components/ShareButton'

const links = { mailto: '', whatsapp: '', x: '', reddit: '', facebook: '', pinterest: '' }
const baseUrl = 'https://nostu.be/video/nevent1abc'

function Harness() {
  const [open, setOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(false)
  return (
    <ShareButton
      shareOpen={open}
      setShareOpen={setOpen}
      shareUrl={includeTimestamp ? `${baseUrl}?t=42` : baseUrl}
      shareTitle="My video"
      includeTimestamp={includeTimestamp}
      setIncludeTimestamp={setIncludeTimestamp}
      shareLinks={links}
    />
  )
}

function mockNativeShare(impl: () => Promise<void>) {
  const share = vi.fn(impl)
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  return share
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
})

describe('ShareButton native share sheet', () => {
  it('opens the native sheet with title and URL and closes the dialog once shared', async () => {
    await i18n.changeLanguage('en')
    const share = mockNativeShare(() => Promise.resolve())
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this video' }))
    expect(share).toHaveBeenCalledWith({ title: 'My video', url: baseUrl })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('treats a cancelled sheet as no error and keeps the dialog with the embed code', async () => {
    await i18n.changeLanguage('en')
    mockNativeShare(() => Promise.reject(new DOMException('cancelled', 'AbortError')))
    render(<Harness />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share this video' }))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'Embed' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>('Embed Code').value).toContain(
      'embed.html?v=nevent1abc'
    )
  })

  it('shares the timestamped link from the dialog when the option is on', async () => {
    await i18n.changeLanguage('en')
    const share = mockNativeShare(() => Promise.reject(new DOMException('cancelled', 'AbortError')))
    render(<Harness />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share this video' }))
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include current timestamp' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share via another app' }))
    })
    expect(share).toHaveBeenLastCalledWith({ title: 'My video', url: `${baseUrl}?t=42` })
  })

  it('keeps the plain dialog without a native share entry where unsupported', async () => {
    await i18n.changeLanguage('en')
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this video' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share via another app' })).toBeNull()
  })
})

describe('ShareButton in nostube', () => {
  it('offers a usable embed for a short without losing its share link', async () => {
    await i18n.changeLanguage('en')
    const shareUrl = 'https://nostu.be/short/nevent1abc'
    render(
      <ShareButton
        shareOpen
        setShareOpen={() => {}}
        shareUrl={shareUrl}
        shareLinks={{
          mailto: `mailto:?body=${encodeURIComponent(shareUrl)}`,
          whatsapp: '',
          x: '',
          reddit: '',
          facebook: '',
          pinterest: '',
        }}
      />
    )
    expect(screen.getByRole('textbox', { name: 'Link' })).toHaveValue(shareUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Embed' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>('Embed Code').value).toContain(
      'src="https://nostu.be/embed.html?v=nevent1abc"'
    )
  })
})
