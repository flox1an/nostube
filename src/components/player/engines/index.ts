/**
 * Protocol-neutral playback engine seam.
 *
 * Adapters for native, HLS, and DASH live behind the {@link PlaybackEngine}
 * interface so VideoPlayer and its controls never branch on streaming protocol.
 */

export {
  usePlaybackEngine,
  resolvePlaybackMode,
  qualityLabelFromVariant,
} from './usePlaybackEngine'
export type { PlaybackEngine, PlaybackEngineMode, QualityOption } from './types'
