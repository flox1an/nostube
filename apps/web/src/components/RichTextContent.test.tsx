import { act, render, screen } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { finalizeEvent, nip19, verifyEvent } from 'nostr-tools'
import type { VerifiedEvent } from 'applesauce-core/helpers/event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RichTextContent } from './RichTextContent'

const NPUB = 'npub1kwehmfjv3h6kanl9lg587qfplfkluuhpsvjapn3w8pntjvccmr6sstadlk'

vi.mock('@nostube/widgets/hooks/useProfile', () => ({
  useProfile: (user?: { pubkey: string }) =>
    user?.pubkey === nip19.decode(NPUB).data ? { name: 'flox' } : undefined,
}))

const renderChat = (content: string, store = new EventStore()) =>
  render(
    <MemoryRouter>
      <EventStoreProvider eventStore={store}>
        <RichTextContent content={content} inline />
      </EventStoreProvider>
    </MemoryRouter>
  )

const expectNewTab = (link: HTMLElement, href: string) => {
  expect(link).toHaveAttribute('href', href)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
}

describe('RichTextContent', () => {
  it('does not include trailing punctuation in YouTube channel links', () => {
    const { container } = render(
      <RichTextContent content="Channel: https://www.youtube.com/channel/UCqDgpnqBDNHUjM5AQ4jsz4A." />
    )

    const link = screen.getByRole('link', { name: /YouTube/i })

    expect(link).toHaveAttribute('href', 'https://www.youtube.com/channel/UCqDgpnqBDNHUjM5AQ4jsz4A')
    expect(link).toHaveTextContent('UCqDgpnqBDNHUjM5AQ4jsz4A')
    expect(container).toHaveTextContent(/UCqDgpnqBDNHUjM5AQ4jsz4A\.$/)
  })

  it('does not include trailing punctuation in regular links', () => {
    render(<RichTextContent content="Read https://example.com/path, then continue." />)

    const link = screen.getByRole('link', { name: 'example.com/path' })

    expect(link).toHaveAttribute('href', 'https://example.com/path')
    expect(screen.getByText(/, then continue\./)).toBeInTheDocument()
  })

  it('forwards the author pubkey and source server to inline image preset URLs', () => {
    const hash = 'a'.repeat(64)
    const { container } = render(
      <RichTextContent content={`https://cdn.example.com/${hash}.jpg`} authorPubkey="deadbeef" />
    )

    const image = container.querySelector('img')
    const src = new URL(image!.getAttribute('src')!)
    expect(src.pathname).toBe(`/v1/preset/feed-preview-v1/${hash}.jpg`)
    expect(src.searchParams.getAll('xs')).toEqual(['cdn.example.com'])
    expect(src.searchParams.get('as')).toBe('deadbeef')
  })
})

describe('RichTextContent inline (chat)', () => {
  const pubkey = 'a'.repeat(64)

  it('links a profile mention by name in a new tab', () => {
    renderChat(`hi nostr:${NPUB}!`)
    expectNewTab(screen.getByRole('link', { name: '@flox' }), `/p/${NPUB}`)
  })

  it('routes videos and live streams here and other notes to njump, all in new tabs', () => {
    const video = nip19.naddrEncode({ kind: 34235, pubkey, identifier: 'v' })
    const short = nip19.neventEncode({ id: 'c'.repeat(64), kind: 22 })
    const live = nip19.naddrEncode({ kind: 30311, pubkey, identifier: 'l' })
    const post = nip19.neventEncode({ id: 'd'.repeat(64), kind: 1 })
    const note = nip19.noteEncode('e'.repeat(64))
    renderChat(`nostr:${video} nostr:${short} nostr:${live} nostr:${post} nostr:${note} #nostr`)
    const [videoLink, shortLink] = screen.getAllByRole('link', { name: 'Video' })
    expectNewTab(videoLink, `/v/${video}`)
    expectNewTab(shortLink, `/v/${short}`)
    expectNewTab(screen.getByRole('link', { name: 'Live' }), `/live/${live}`)
    const [postLink, noteLink] = screen.getAllByRole('link', { name: 'Note' })
    expectNewTab(postLink, `https://njump.me/${post}`)
    expectNewTab(noteLink, `https://njump.me/${note}`)
    expectNewTab(screen.getByRole('link', { name: '#nostr' }), '/tag/nostr')
  })

  it('reroutes a kindless note once the store knows it is a video', () => {
    const store = new EventStore()
    store.verifyEvent = (candidate): candidate is VerifiedEvent => verifyEvent(candidate)
    const event = finalizeEvent(
      { kind: 21, created_at: 1, tags: [], content: '' },
      new Uint8Array(32).fill(1)
    )
    const note = nip19.noteEncode(event.id)
    renderChat(`watch nostr:${note}`, store)
    expectNewTab(screen.getByRole('link', { name: 'Note' }), `https://njump.me/${note}`)

    act(() => {
      store.add(event)
    })
    expectNewTab(screen.getByRole('link', { name: 'Video' }), `/v/${note}`)
  })

  it('renders URLs as plain new-tab links without image or brand previews', () => {
    const { container } = renderChat(
      'https://cdn.example.com/cat.png https://youtu.be/abc javascript:alert(1)'
    )
    expect(container.firstElementChild?.tagName).toBe('SPAN')
    expect(container.querySelector('img, svg')).toBeNull()
    expectNewTab(
      screen.getByRole('link', { name: 'cdn.example.com/cat.png' }),
      'https://cdn.example.com/cat.png'
    )
    expectNewTab(screen.getByRole('link', { name: 'youtu.be/abc' }), 'https://youtu.be/abc')
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
