/**
 * Protocol-neutral playback engine interface.
 *
 * Each streaming protocol — native `<video>`, HLS (hls.js), DASH (dash.js) — is
 * an Adapter behind this seam. VideoPlayer renders the media element and wires
 * the settings controls through this single interface instead of branching on
 * each protocol's implementation.
 */

/** Which playback adapter is active for the current source. */
export type PlaybackEngineMode = 'native' | 'hls' | 'dash'

/**
 * A single selectable quality rendition, expressed protocol-neutrally.
 *
 * `id` is opaque to consumers: it may be an HLS level index, a native variant
 * index, or the `-1` sentinel for HLS "Auto". It is only meaningful paired with
 * the engine that produced it, and is only ever handed back to that engine's
 * `selectQuality`.
 */
export interface QualityOption {
  id: number
  label: string
  description?: string
  contributorPubkey?: string
}

/**
 * The contract every playback adapter satisfies.
 *
 * - `elementSrc` / `managedSource` tell VideoPlayer how to feed the media
 *   element: native sets `src` directly; HLS/DASH manage the source themselves
 *   (via MSE) so VideoPlayer must leave the element `src` unset.
 * - `qualityOptions` / `selectedQuality` / `selectQuality` drive the settings
 *   menu without the view branching on protocol.
 * - `activeQualityLabel` surfaces the rendition currently playing under "Auto",
 *   so the view can render "Auto (720p)" without knowing about HLS levels.
 */
export interface PlaybackEngine {
  mode: PlaybackEngineMode
  /** Value for the media element `src`; `undefined` when `managedSource` is true. */
  elementSrc: string | undefined
  /** True when the adapter owns the element source (HLS/DASH via MSE). */
  managedSource: boolean
  /** Adapter is loading its initial data. */
  loading: boolean
  /** Fatal adapter error, if any. */
  error: string | null
  /** Selectable quality renditions (empty for single-quality sources). */
  qualityOptions: QualityOption[]
  /** `id` of the currently-selected {@link QualityOption}, or `undefined`. */
  selectedQuality: number | undefined
  /** Label of the rendition actually playing under Auto, or `null`. */
  activeQualityLabel: string | null
  /** Select a quality by {@link QualityOption.id}. */
  selectQuality: (id: number) => void
}
