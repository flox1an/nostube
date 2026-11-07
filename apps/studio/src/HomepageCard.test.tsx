import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { videoRef } from '@nostube/core/hidden-videos'
import type { SiteHomepage } from '@nostube/core/instance-config'
import { processEvent, type VideoEvent } from '@nostube/core/video-event'
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type NostrEvent } from 'nostr-tools'
import { of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { TimelineProvider } from '@nostube/widgets/timeline'
import { HomepageCard } from './HomepageCard'
import type { InstanceClient } from './instance-client'
import './i18n'

const loaded = vi.hoisted(() => ({
  videos: [] as unknown[],
  refs: [] as string[],
  pins: [] as unknown[],
  /** The instance relay's answer to any search, best match first. */
  found: [] as NostrEvent[],
}))
// `of` is read when the card boots, after the static imports are in.
vi.mock('./instance-client', () => ({
  bootInstanceClient: async () => ({
    config: { startPage: { creator: 'c' }, videoSources: [] },
    client: { eventStore: { add: (e: unknown) => e }, searchVideos: () => of(...loaded.found) },
  }),
}))
vi.mock('@nostube/widgets/instance-providers', () => ({
  InstanceProviders: ({ client, children }: { client: never; children: ReactNode }) => (
    <TimelineProvider value={{ client, policy: { getAllMissingVideos: () => ({}) } }}>
      {children}
    </TimelineProvider>
  ),
}))
vi.mock('@nostube/widgets/hooks/useCreatorVideos', () => ({
  useCreatorVideos: () => ({ videos: loaded.videos, loading: false, error: null, hasMore: false }),
}))
vi.mock('@nostube/widgets/hooks/usePinnedVideos', () => ({
  usePinnedVideos: () => ({
    refs: loaded.refs,
    videos: loaded.pins,
    ready: true,
    error: '',
    event: undefined,
  }),
}))
vi.mock('./signer-context', () => ({
  useSigner: () => ({ signer: null, pubkey: null }),
}))
vi.mock('@nostube/widgets/hooks/useVideosByRef', () => ({ useVideosByRef: () => new Map() }))

const key = generateSecretKey()
const makeEvent = (d: string, title: string) =>
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
  )
const events = [makeEvent('a', 'Alpha'), makeEvent('b', 'Beta'), makeEvent('c', 'Gamma')]
const [a, b, c] = events.map(e => processEvent(e, [])!)
loaded.videos = [a, b, c]

function Editor({ onSaved }: { onSaved: (homepage: SiteHomepage | undefined) => void }) {
  const [homepage, setHomepage] = useState<SiteHomepage>()
  const [videos, setVideos] = useState<VideoEvent[]>([])
  const [pins, setPins] = useState<string[]>([])
  onSaved(homepage)
  return (
    <>
      <HomepageCard
        homepage={homepage}
        hiddenText={videoRef(c)}
        onChange={setHomepage}
        videos={videos}
        onVideos={setVideos}
        instance={{ config: { startPage: { creator: a.pubkey } } } as InstanceClient}
        onPins={setPins}
      />
      <output>{pins.join(',')}</output>
    </>
  )
}

describe('homepage editor', () => {
  it('curates an empty homepage from videos, a pasted link, links and a main button', async () => {
    let homepage: SiteHomepage | undefined
    render(<Editor onSaved={h => (homepage = h)} />)

    // An older config: nothing configured, nothing changed until the creator edits.
    expect((screen.getByLabelText('Introduction') as HTMLTextAreaElement).value).toBe('')
    fireEvent.click(await screen.findByRole('button', { name: 'Add “Alpha”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add “Beta”' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move “Beta” up' }))

    // A hidden video is no choice.
    const disabled = (name: string) =>
      (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
    expect(disabled('Add “Gamma”')).toBe(true)

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
      featuredText: '',
      links: [{ label: 'Shop', url: 'https://shop.example/' }],
      action: { label: 'Support me', url: 'https://support.example/' },
    })
    expect(screen.getByRole('status').textContent).toBe(
      [videoRef(b), `34236:${older.pubkey}:old:clip`, videoRef(a)].join(',')
    )
  })

  it('searches the instance relay in its ranking; a hidden match stays no choice', async () => {
    loaded.found = [events[2], events[0]]
    render(<Editor onSaved={() => {}} />)
    await screen.findByRole('button', { name: 'Add “Beta”' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search videos' }), {
      target: { value: 'a' },
    })
    const adds = () =>
      (screen.queryAllByRole('button', { name: /^Add “/ }) as HTMLButtonElement[]).map(button => [
        button.getAttribute('aria-label'),
        button.disabled,
      ])
    await waitFor(() =>
      expect(adds()).toEqual([
        ['Add “Gamma”', true],
        ['Add “Alpha”', false],
      ])
    )
  })
})
