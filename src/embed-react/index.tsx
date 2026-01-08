import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmbedApp } from './EmbedApp'
import { EmbedAppProvider } from './EmbedAppProvider'
import { parseURLParams, validateParams } from './lib/url-params'
import { decodeVideoIdentifier, buildRelayList } from './lib/nostr-decoder'
import { NostrClient } from './lib/nostr-client'
import { ProfileFetcher } from './lib/profile-fetcher'
import { processEvent, type VideoEvent } from '@/utils/video-event'
import type { Profile } from './lib/profile-fetcher'
import { TooltipProvider } from '@/components/ui/tooltip'
import './embed.css'

interface EmbedState {
  video: VideoEvent | null
  profile: Profile | null
  error: string | null
  isLoading: boolean
  authorBlossomServers: string[]
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
      authorBlossomServers: [],
    })
    return
  }

  // Show loading state
  renderApp(reactRoot, params, {
    video: null,
    profile: null,
    error: null,
    isLoading: true,
    authorBlossomServers: [],
  })

  try {
    // Decode video identifier
    const identifier = decodeVideoIdentifier(params.videoId)
    if (!identifier) {
      renderApp(reactRoot, params, {
        video: null,
        profile: null,
        error: 'Invalid video ID',
        isLoading: false,
        authorBlossomServers: [],
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
        authorBlossomServers: [],
      })
      return
    }

    // Fetch blossom servers first (needed for fallback URLs)
    console.log('[Embed] Starting blossom server fetch for author:', video.pubkey.slice(0, 8))
    const authorBlossomServers = await client.fetchBlossomServers(video.pubkey)
    console.log('[Embed] Blossom servers received:', authorBlossomServers)

    // Now render with video data and blossom servers
    renderApp(reactRoot, params, {
      video,
      profile: null,
      error: null,
      isLoading: false,
      authorBlossomServers,
    })

    // Fetch profile in background (non-blocking)
    const profileFetcher = new ProfileFetcher(client)
    const profile = await profileFetcher.fetchProfile(video.pubkey, relays)
    renderApp(reactRoot, params, {
      video,
      profile,
      error: null,
      isLoading: false,
      authorBlossomServers,
    })

    // Cleanup
    client.closeAll()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load video'
    renderApp(reactRoot, params, {
      video: null,
      profile: null,
      error: message,
      isLoading: false,
      authorBlossomServers: [],
    })
  }
}

function renderApp(
  root: ReturnType<typeof createRoot>,
  params: ReturnType<typeof parseURLParams>,
  state: EmbedState
): void {
  root.render(
    <StrictMode>
      <EmbedAppProvider authorBlossomServers={state.authorBlossomServers}>
        <TooltipProvider>
          <EmbedApp
            params={params}
            video={state.video}
            profile={state.profile}
            error={state.error}
            isLoading={state.isLoading}
          />
        </TooltipProvider>
      </EmbedAppProvider>
    </StrictMode>
  )
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmbed)
} else {
  initEmbed()
}
