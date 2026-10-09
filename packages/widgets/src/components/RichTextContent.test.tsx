import { render, screen } from '@testing-library/react'
import { nip19 } from 'nostr-tools'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { RichTextContent, type RichTextLinks } from './RichTextContent'

const links: RichTextLinks = {
  profile: () => ({ href: 'https://profiles.example/x' }),
  hashtag: tag => (tag === 'known' ? { to: `/tag/${tag}` } : null),
  timestamp: (_video, seconds) => ({ to: `/t?s=${seconds}` }),
  event: ref => (ref.kind === 34235 ? { href: `https://videos.example/${ref.nip19}` } : null),
}

const renderText = (content: string, custom: Partial<RichTextLinks> = {}) =>
  render(
    <MemoryRouter>
      <RichTextContent content={content} links={{ ...links, ...custom }} videoLink="nevent1abc" />
    </MemoryRouter>
  )

describe('RichTextContent link targets', () => {
  it('renders a tag as a link only when the app gives it a page', () => {
    renderText('#known and #other')
    expect(screen.getByRole('link', { name: '#known' }).getAttribute('href')).toBe('/tag/known')
    expect(screen.queryByRole('link', { name: '#other' })).toBeNull()
    expect(screen.getByText('#other')).toBeTruthy()
  })

  it('turns a timestamp into the link the app builds', () => {
    renderText('Chapter 1:05 starts')
    expect(screen.getByRole('link', { name: '1:05' }).getAttribute('href')).toBe('/t?s=65')
  })

  it('links a video reference where the app says and leaves other events as text', () => {
    const video = nip19.naddrEncode({ kind: 34235, pubkey: 'a'.repeat(64), identifier: 'x' })
    const note = nip19.noteEncode('b'.repeat(64))
    renderText(`nostr:${video} and nostr:${note}`)
    expect(screen.getByRole('link', { name: 'Video' }).getAttribute('href')).toBe(
      `https://videos.example/${video}`
    )
    expect(screen.getByText(new RegExp(`nostr:${note}`))).toBeTruthy()
  })

  it('opens an external target in a new tab without leaking the opener', () => {
    renderText(
      'nostr:' + nip19.naddrEncode({ kind: 34235, pubkey: 'a'.repeat(64), identifier: 'y' })
    )
    const link = screen.getByRole('link', { name: 'Video' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
