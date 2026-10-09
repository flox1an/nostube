import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminState } from './api'
import { BrandingCard } from './BrandingCard'
import i18n from './i18n'

function Harness() {
  const [branding, setBranding] = useState<AdminState['branding']>({
    logo: null,
    favicon: null,
    banner: null,
  })
  return (
    <BrandingCard
      branding={branding}
      onBranding={(slot, url) => setBranding(b => ({ ...b, [slot]: url }))}
    />
  )
}

const choose = (label: string, file: File) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })

describe('BrandingCard', () => {
  const fetch = vi.fn()
  beforeEach(async () => {
    vi.stubGlobal('fetch', fetch)
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetch.mockReset()
  })

  it('refuses a too big or wrong file before uploading and shows what the server refused', async () => {
    render(<Harness />)
    choose('Logo', new File([new Uint8Array(512 * 1024 + 1)], 'big.png', { type: 'image/png' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The file is too big: at most 512 KB.'
    )
    choose('Logo', new File(['<html>'], 'page.html', { type: 'text/html' }))
    expect(screen.getByRole('alert').textContent).toMatch(/file type is not allowed/)
    expect(fetch).not.toHaveBeenCalled()

    // A renamed file passes the browser's check; the server looks at the bytes and refuses it.
    fetch.mockResolvedValueOnce(new Response('{"error":"no"}', { status: 415 }))
    choose('Logo', new File(['<html>'], 'page.png', { type: 'image/png' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/file type is not allowed/)
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding/logo',
      expect.objectContaining({ method: 'PUT' })
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the uploaded image and removes it again', async () => {
    render(<Harness />)
    fetch.mockResolvedValueOnce(Response.json({ url: '/branding/banner?v=abc' }))
    choose('Banner', new File([new Uint8Array(1024 * 1024)], 'b.png', { type: 'image/png' }))
    expect((await screen.findByRole('img', { name: 'Banner' })).getAttribute('src')).toBe(
      '/branding/banner?v=abc'
    )
    fetch.mockResolvedValueOnce(Response.json({ ok: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(screen.queryByRole('img', { name: 'Banner' })).toBeNull())
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/admin/branding/banner',
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
