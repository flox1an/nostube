import { fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { videoRef } from '@nostube/core/hidden-videos'
import type { SiteHomepage } from '@nostube/core/instance-config'
import { processEvent, type VideoEvent } from '@nostube/core/video-event'
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'
import { describe, expect, it, vi } from 'vitest'
import { HomepageCard } from './HomepageCard'
import './i18n'

const loaded = vi.hoisted(() => ({ videos: [] as unknown[] }))
vi.mock('./instance-client', () => ({
  bootInstanceClient: async () => ({ config: { startPage: { creator: 'c' } }, client: {} }),
}))
vi.mock('@nostube/widgets/instance-providers', () => ({
  InstanceProviders: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@nostube/widgets/hooks/useCreatorVideos', () => ({
  useCreatorVideos: () => ({ videos: loaded.videos, loading: false, error: null, hasMore: false }),
}))

const key = generateSecretKey()
const makeVideo = (d: string, title: string) =>
  processEvent(
    finalizeEvent(
      {
        kind: 34235,
        created_at: 100,
        content: '',
        tags: [
          ['d', d],
          ['title', title],
          ['imeta', 'url https://media.example/a.mp4', 'm video/mp4'],
        ],
      },
      key
    ),
    []
  )!
const [a, b, c] = [makeVideo('a', 'Alpha'), makeVideo('b', 'Beta'), makeVideo('c', 'Gamma')]
loaded.videos = [a, b, c]

function Editor({ onSaved }: { onSaved: (homepage: SiteHomepage | undefined) => void }) {
  const [homepage, setHomepage] = useState<SiteHomepage>()
  const [videos, setVideos] = useState<VideoEvent[]>([])
  onSaved(homepage)
  return (
    <HomepageCard
      homepage={homepage}
      hiddenText={videoRef(c)}
      onChange={setHomepage}
      videos={videos}
      onVideos={setVideos}
    />
  )
}

describe('homepage editor', () => {
  it('curates an empty homepage from videos, a pasted link, links and a main button', async () => {
    let homepage: SiteHomepage | undefined
    render(<Editor onSaved={h => (homepage = h)} />)

    // An older config: nothing configured, nothing changed until the creator edits.
    expect((screen.getByLabelText('Introduction') as HTMLTextAreaElement).value).toBe('')
    fireEvent.click(await screen.findByRole('button', { name: 'Add “Alpha”' }))
    expect(homepage).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Add “Beta”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Feature “Beta”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move “Beta” up' }))

    // A hidden video is no choice.
    const disabled = (name: string) =>
      (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
    expect(disabled('Add “Gamma”')).toBe(true)
    expect(disabled('Feature “Gamma”')).toBe(true)

    const paste = screen.getByLabelText('Or paste a video link')
    fireEvent.change(paste, { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert').textContent).toBe('This is not a video link.')
    const hiddenLink = nip19.naddrEncode({ kind: 34235, pubkey: c.pubkey, identifier: 'c' })
    fireEvent.change(paste, { target: { value: `https://site.example/v/${hiddenLink}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('alert').textContent).toMatch(/hidden/)
    const older = { kind: 34236, pubkey: getPublicKey(key), identifier: 'old:clip' }
    fireEvent.change(paste, { target: { value: `nostr:${nip19.naddrEncode(older)}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('Video not loaded in the list')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove “Alpha”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add “Alpha”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    fireEvent.change(screen.getByLabelText('Name of link 1'), { target: { value: 'Shop' } })
    fireEvent.change(screen.getByLabelText('Address of link 1'), {
      target: { value: 'https://shop.example/' },
    })
    fireEvent.click(screen.getByLabelText('Show a main button'))
    fireEvent.change(screen.getByLabelText('Name of the main button'), {
      target: { value: 'Support me' },
    })
    fireEvent.change(screen.getByLabelText('Address of the main button'), {
      target: { value: 'https://support.example/' },
    })

    expect(homepage).toEqual({
      intro: '',
      featured: videoRef(b),
      featuredText: '',
      selected: [videoRef(b), `34236:${older.pubkey}:old:clip`, videoRef(a)],
      links: [{ label: 'Shop', url: 'https://shop.example/' }],
      action: { label: 'Support me', url: 'https://support.example/' },
    })
  })
})
