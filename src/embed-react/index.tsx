import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmbedApp } from './EmbedApp'
import { parseURLParams, validateParams } from './lib/url-params'
import { decodeVideoIdentifier, buildRelayList } from './lib/nostr-decoder'
import { NostrClient } from './lib/nostr-client'
import { ProfileFetcher } from './lib/profile-fetcher'
import { processEvent, type VideoEvent } from '@/utils/video-event'
import type { Profile } from './lib/profile-fetcher'
import './embed.css'

interface EmbedState {
  video: VideoEvent | null
  profile: Profile | null
  error: string | null
  isLoading: boolean
}

async function initEmbed(): Promise<void> {
  const root = document.getElementById('nostube-embed')
  if (!root) {
    console.error('[Embed] Root element not found')
    return
  }

  const reactRoot = createRoot(root)

  // Parse URL params
  const params = parseURLParams()
  const validation = validateParams(params)

  if (!validation.valid) {
    renderApp(reactRoot, params, {
      video: null,
      profile: null,
      error: validation.error!,
      isLoading: false,
    })
    return
  }

  // Show loading state
  renderApp(reactRoot, params, { video: null, profile: null, error: null, isLoading: true })

  try {
    // Decode video identifier
    const identifier = decodeVideoIdentifier(params.videoId)
    if (!identifier) {
      renderApp(reactRoot, params, {
        video: null,
        profile: null,
        error: 'Invalid video ID',
        isLoading: false,
      })
      return
    }

    // Build relay list
    const hintRelays = identifier.type === 'event' ? identifier.data.relays : identifier.data.relays
    const relays = buildRelayList(hintRelays, params.customRelays)

    // Create Nostr client
    const client = new NostrClient(relays)

    // Fetch video event
    const event = await client.fetchEvent(identifier)
    const video = processEvent(event, relays)
    if (!video) {
      renderApp(reactRoot, params, {
        video: null,
        profile: null,
        error: 'Failed to parse video event',
        isLoading: false,
      })
      return
    }

    // Fetch profile in parallel (non-blocking)
    const profileFetcher = new ProfileFetcher(client)
    const profilePromise = profileFetcher.fetchProfile(video.pubkey, relays)

    // Render with video data (profile may still be loading)
    renderApp(reactRoot, params, { video, profile: null, error: null, isLoading: false })

    // Update with profile when ready
    const profile = await profilePromise
    renderApp(reactRoot, params, { video, profile, error: null, isLoading: false })

    // Cleanup
    client.closeAll()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load video'
    renderApp(reactRoot, params, { video: null, profile: null, error: message, isLoading: false })
  }
}

function renderApp(
  root: ReturnType<typeof createRoot>,
  params: ReturnType<typeof parseURLParams>,
  state: EmbedState
): void {
  root.render(
    <StrictMode>
      <EmbedApp
        params={params}
        video={state.video}
        profile={state.profile}
        error={state.error}
        isLoading={state.isLoading}
      />
    </StrictMode>
  )
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmbed)
} else {
  initEmbed()
}
