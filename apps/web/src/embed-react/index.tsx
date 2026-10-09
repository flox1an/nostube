import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmbedApp, type EmbedPlayback } from './EmbedApp'
import { EmbedAppProvider } from './EmbedAppProvider'
import { parseURLParams, validateParams } from './lib/url-params'
import { decodeVideoIdentifier, buildRelayList } from './lib/nostr-decoder'
import { NostrClient } from './lib/nostr-client'
import { ProfileFetcher } from './lib/profile-fetcher'
import { processEvent, type VideoEvent } from '@nostube/core/video-event'
import type { Profile } from './lib/profile-fetcher'
import { TooltipProvider } from '@nostube/widgets/components/tooltip'
import { APP_CONFIG_STORAGE_KEY, type NsfwFilter } from '@nostube/core'
import {
  getEffectiveNsfwFilter,
  getVideoPlayback,
  NSFW_SAFETY_ENABLED,
} from '@nostube/core/content-safety'
import { parsePresetEvent } from '@/hooks/usePresets'
import { getCachedPreset, LOAD_TIMEOUT } from '@/lib/preset-storage'
import { METADATA_RELAYS, presetRelays } from '@/constants/relays'
import {
  DEFAULT_PRESET_PUBKEY,
  PRESET_D_TAG,
  PRESET_EVENT_KIND,
  type NostubePreset,
} from '@nostube/core'
import './embed.css'

interface EmbedState {
  video: VideoEvent | null
  /** Missing means not decided yet; rendered as 'hidden' (fail closed). */
  playback?: EmbedPlayback
  profile: Profile | null
  error: string | null
  isLoading: boolean
  authorBlossomServers: string[]
}

/**
 * The viewer's own nostube settings. Only readable when the embed runs on the
 * nostube origin itself: browsers partition storage for cross-site iframes, so
 * there this is empty and the effective mode is 'hide'. URL params never
 * loosen this.
 */
function readViewerSettings(): { nsfwFilter: NsfwFilter; presetPubkey: string } {
  let stored: {
    nsfwFilter?: unknown
    nsfwAgeConfirmed?: unknown
    selectedPresetPubkey?: unknown
  } | null = null
  try {
    stored = JSON.parse(localStorage.getItem(APP_CONFIG_STORAGE_KEY) ?? 'null')
  } catch {
    // Storage blocked or corrupt: treat as a viewer without settings
  }
  const selected = stored?.selectedPresetPubkey
  return {
    nsfwFilter: getEffectiveNsfwFilter(stored),
    presetPubkey:
      typeof selected === 'string' && /^[0-9a-f]{64}$/.test(selected)
        ? selected
        : DEFAULT_PRESET_PUBKEY,
  }
}

/** Moderation preset (NSFW + blocked lists); null when it can't be loaded. */
async function loadPreset(pubkey: string): Promise<NostubePreset | null> {
  const cached = getCachedPreset(pubkey)
  if (cached && !cached.stale) return cached.preset

  const client = new NostrClient([
    ...new Set([...presetRelays.map(r => r.url), ...METADATA_RELAYS]),
  ])
  try {
    const event = await client.fetchLatest(
      { kinds: [PRESET_EVENT_KIND], authors: [pubkey], '#d': [PRESET_D_TAG] },
      LOAD_TIMEOUT
    )
    return (event && parsePresetEvent(event)) || cached?.preset || null
  } finally {
    client.closeAll()
  }
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

    // The moderation preset loads in parallel with the video event.
    const viewer = readViewerSettings()
    const presetPromise = loadPreset(viewer.presetPubkey)

    // Create Nostr client
    const client = new NostrClient(relays)

    // Fetch video event
    const [event, preset] = await Promise.all([client.fetchEvent(identifier), presetPromise])
    if (preset?.blockedPubkeys.includes(event.pubkey) || preset?.blockedEvents.includes(event.id)) {
      client.closeAll()
      renderApp(reactRoot, params, {
        video: null,
        profile: null,
        error: 'This video is not available',
        isLoading: false,
        authorBlossomServers: [],
      })
      return
    }
    const video = processEvent(event, relays, undefined, preset?.nsfwPubkeys)
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

    // Fail closed: without the preset, NSFW authors can't be recognised, so
    // nothing plays. Self-hosted builds with VITE_NSFW_SAFETY=off skip the gate.
    const playback: EmbedPlayback = !NSFW_SAFETY_ENABLED
      ? 'play'
      : !preset
        ? 'unverified'
        : getVideoPlayback(video.contentWarning, viewer.nsfwFilter)
    if (playback === 'hidden' || playback === 'unverified') {
      client.closeAll()
      renderApp(reactRoot, params, {
        video,
        playback,
        profile: null,
        error: null,
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
      playback,
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
      playback,
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
            playback={state.playback ?? 'hidden'}
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
