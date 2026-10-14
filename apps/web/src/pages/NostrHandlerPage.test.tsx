import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { nip19 } from 'nostr-tools'
import i18n from '@/i18n/config'
import { NostrHandlerPage } from './NostrHandlerPage'

const store = vi.hoisted(() => ({ events: new Map<string, { kind: number }>() }))
vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({ getEvent: (id: string) => store.events.get(id) }),
}))
vi.mock('@/hooks/useAppContext', () => ({ useAppContext: () => ({ pool: {} }) }))
vi.mock('@/hooks/useReadRelays', () => ({ useReadRelays: () => [] }))

function Where() {
  const location = useLocation()
  return <p>at {location.pathname}</p>
}

function renderHandler(uri: string) {
  return render(
    <MemoryRouter initialEntries={[`/nostr-handler?uri=${encodeURIComponent(uri)}`]}>
      <Routes>
        <Route path="/nostr-handler" element={<NostrHandlerPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('NostrHandlerPage', () => {
  it('shows an error with a way home for an invalid identifier', async () => {
    await i18n.changeLanguage('en')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderHandler('web+nostr:garbage')
    expect(await screen.findByRole('heading', { name: "Can't open this link" })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Return to Home' })).toHaveAttribute('href', '/')
    vi.restoreAllMocks()
  })

  it('opens the profile page for an npub', async () => {
    const npub = nip19.npubEncode('a'.repeat(64))
    renderHandler(`web+nostr:${npub}`)
    expect(await screen.findByText(`at /p/${npub}`)).toBeInTheDocument()
  })

  it('routes a note by the kind of the loaded event', async () => {
    const id = 'c'.repeat(64)
    store.events.set(id, { kind: 22 })
    const note = nip19.noteEncode(id)
    renderHandler(`web+nostr:${note}`)
    expect(await screen.findByText(`at /short/${note}`)).toBeInTheDocument()
  })
})
