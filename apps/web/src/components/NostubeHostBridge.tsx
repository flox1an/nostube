import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useMemo, type ReactNode } from 'react'
import { PlatformProvider, type Platform } from '@nostube/widgets/platform'
import { NostubeHostProvider, useNostubeHostValue } from '@nostube/widgets/host'
import { INDEXER_RELAYS, METADATA_RELAYS, ZAP_RELAYS } from '@/constants/relays'
import { useAppContext } from '@/hooks/useAppContext'
import { useReadRelays } from '@/hooks/useReadRelays'

/** The desktop shell's native window; absent in the browser. Decided once at module load; whether the app runs in a desktop shell cannot change. */
const platform: Platform = {
  nativeWindow: isTauri()
    ? {
        setFullscreen: fullscreen => getCurrentWindow().setFullscreen(fullscreen),
        isFullscreen: () => getCurrentWindow().isFullscreen(),
      }
    : undefined,
}

/**
 * Hands the app's config, relay pool and lookup relays to the shared hooks and widgets of
 * @nostube/widgets. Render it inside the AppContext provider.
 */
export function NostubeHostBridge({ children }: { children: ReactNode }) {
  const { config, pool } = useAppContext()
  const read = useReadRelays()
  const relays = useMemo(
    () => ({ read, indexer: INDEXER_RELAYS, metadata: METADATA_RELAYS, zap: ZAP_RELAYS }),
    [read]
  )
  const host = useNostubeHostValue(config, pool, relays)
  return (
    <NostubeHostProvider value={host}>
      <PlatformProvider value={platform}>{children}</PlatformProvider>
    </NostubeHostProvider>
  )
}
