import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminState } from './api'
import { BrandingCard } from './BrandingCard'
import i18n from './i18n'

vi.mock('./signer-context', () => ({ useSigner: () => ({ signer: null, pubkey: null }) }))

function Harness() {
  const [branding, setBranding] = useState<AdminState['branding']>({
    logo: null,
    favicon: null,
    banner: null,
    icon: null,
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

  it('refuses oversized originals and non-images without uploading', async () => {
    render(<Harness />)
    choose(
      'Logo',
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    )
    expect(await screen.findByRole('alert')).toBeTruthy()
    choose('Logo', new File(['<html>'], 'page.html', { type: 'text/html' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uploads the app icon as it is and explains a refused shape', async () => {
    render(<Harness />)
    choose('App icon', new File(['x'], 'icon.webp', { type: 'image/webp' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'no' }), { status: 422 }))
    choose('App icon', new File(['png'], 'icon.png', { type: 'image/png' }))
    expect(
      await screen.findByText('The app icon must be square and at least 512×512 pixels.')
    ).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/branding/icon',
      expect.objectContaining({ method: 'PUT' })
    )
  })
})
