# Browser-Side Video Transcoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intercept dropped video files before upload, transcode them in-browser (HEVC 1080p primary + AVC 480p fallback) using mediabunny/WebCodecs, then upload the optimised artifacts — making server-side DVM transcoding only needed for HLS, encryption, or unsupported browsers.

**Architecture:** A new `src/lib/video-transcode.ts` holds pure probe/decision/encode logic with a lazy `import('mediabunny')`. A `useVideoTranscode` hook manages multi-variant state. A `BrowserTranscodeStep` component is injected into Step 1 of `VideoUpload.tsx` between file-drop and upload. `useVideoUpload.onDrop` gains a new `'transcoding'` upload-state that pauses the existing upload path until the transcode step resolves. DVM alert continues to work unchanged, naturally seeing the browser-created resolutions as already-existing.

**Tech Stack:** mediabunny (WebCodecs), MP4Box.js (existing, for source codec probe), React, TypeScript, shadcn/ui Alert + Progress + Checkbox, i18next

---

## File Map

| Action | File                                                   | Responsibility                                        |
| ------ | ------------------------------------------------------ | ----------------------------------------------------- |
| Create | `src/lib/video-transcode.ts`                           | Probe, decide, encode — no React, no UI               |
| Create | `src/lib/video-transcode.test.ts`                      | Unit tests for pure functions                         |
| Create | `src/hooks/useVideoTranscode.ts`                       | React state wrapper for multi-variant transcode       |
| Create | `src/components/video-upload/BrowserTranscodeStep.tsx` | UI card shown between drop and upload                 |
| Modify | `src/hooks/useVideoUpload.ts`                          | Add `'transcoding'` state + two new callback handlers |
| Modify | `src/components/VideoUpload.tsx`                       | Render `BrowserTranscodeStep` in Step 1               |
| Modify | `src/i18n/locales/en.json`                             | New `upload.browserTranscode.*` keys                  |
| Modify | `src/i18n/locales/de.json`                             | Stub translations (same text as en)                   |
| Modify | `src/i18n/locales/fr.json`                             | Stub translations                                     |
| Modify | `src/i18n/locales/es.json`                             | Stub translations                                     |
| Modify | `CHANGELOG.md`                                         | Record the feature                                    |

---

## Task 1: Install mediabunny

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install mediabunny
```

Expected output: `added 1 package` (or similar — mediabunny has no sub-dependencies).

- [ ] **Step 2: Verify build still passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no new errors (mediabunny is not imported yet so bundle size unchanged).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add mediabunny for browser-side video transcoding"
```

---

## Task 2: Core transcode library

**Files:**

- Create: `src/lib/video-transcode.ts`
- Create: `src/lib/video-transcode.test.ts`

### About this module

All functions in `video-transcode.ts` must be usable without importing React. The `transcodeFile` function lazy-imports mediabunny so it only loads when actually called. Probe functions use the existing `getCodecsFromFile` (MP4Box, works for MP4) plus a plain video element for dimensions/duration (works for all containers).

### Decision constants

- `BITRATE_CUTOFF_MBPS = 15` — re-encode even well-encoded files above this
- `PRIMARY_TARGET_HEIGHT = 1080` — cap primary variant at 1080p
- `FALLBACK_TARGET_HEIGHT = 480` — AVC fallback resolution
- `BPP_MEDIUM = 0.22` — bits-per-pixel for medium quality (matches nostr-compress)

### `TranscodeRecommendation` values

- `'none'` — source is MP4, HEVC or AVC, ≤1080p, ≤15 Mbps → no primary re-encode needed (480p fallback still produced if source > 480p)
- `'bitrate'` — codec/container/resolution OK but bitrate > 15 Mbps
- `'full'` — wrong container, wrong codec, or height > 1080p

- [ ] **Step 1: Write the failing tests**

Create `src/lib/video-transcode.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  assessTranscodeNeed,
  computeTargetDimensions,
  defaultVariants,
  type TranscodeSourceMeta,
} from './video-transcode'

const baseMeta: TranscodeSourceMeta = {
  width: 1920,
  height: 1080,
  duration: 60,
  sizeMB: 500,
  bitrateMbps: 60,
  videoCodec: 'hvc1.1.6.L123.B0',
  mimeType: 'video/mp4',
}

describe('assessTranscodeNeed', () => {
  it('returns full for non-mp4 container', () => {
    expect(assessTranscodeNeed({ ...baseMeta, mimeType: 'video/webm' })).toBe('full')
  })

  it('returns full for AV1 codec', () => {
    expect(assessTranscodeNeed({ ...baseMeta, videoCodec: 'av01.0.04M.08' })).toBe('full')
  })

  it('returns full for height > 1080', () => {
    expect(assessTranscodeNeed({ ...baseMeta, height: 2160, bitrateMbps: 5 })).toBe('full')
  })

  it('returns bitrate when codec/container/res fine but bitrate > 15', () => {
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        bitrateMbps: 20,
        mimeType: 'video/mp4',
        videoCodec: 'hvc1.1',
      })
    ).toBe('bitrate')
  })

  it('returns none when source is already optimised', () => {
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        bitrateMbps: 10,
        videoCodec: 'hvc1.1',
        mimeType: 'video/mp4',
      })
    ).toBe('none')
  })

  it('returns none for AVC below 15 Mbps', () => {
    expect(
      assessTranscodeNeed({
        ...baseMeta,
        bitrateMbps: 8,
        videoCodec: 'avc1.64001F',
        mimeType: 'video/mp4',
      })
    ).toBe('none')
  })

  it('treats missing videoCodec as requiring full transcode', () => {
    expect(assessTranscodeNeed({ ...baseMeta, videoCodec: undefined })).toBe('full')
  })
})

describe('computeTargetDimensions', () => {
  it('scales landscape 1920x1080 to 1080p unchanged', () => {
    expect(computeTargetDimensions(1920, 1080, 1080)).toEqual({ width: 1920, height: 1080 })
  })

  it('scales landscape 3840x2160 down to 1080p', () => {
    expect(computeTargetDimensions(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 })
  })

  it('does not upscale — 320x180 source with 1080p target stays at source', () => {
    expect(computeTargetDimensions(320, 180, 1080)).toEqual({ width: 320, height: 180 })
  })

  it('produces even dimensions', () => {
    // 1280x719 source → 480p → 853.xxx wide → must be even
    const { width, height } = computeTargetDimensions(1280, 719, 480)
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
  })

  it('handles portrait video (height > width)', () => {
    // 1080x1920 portrait → 1080p → stays at source (height is already 1920, target is 1080 for short dim)
    // For portrait we target the short dimension (width=1080 is the "p" value)
    const { width, height } = computeTargetDimensions(1080, 1920, 1080)
    expect(width).toBe(1080)
    expect(height).toBe(1920)
  })
})

describe('defaultVariants', () => {
  it('produces HEVC 1080p primary + AVC 480p fallback for 4K source', () => {
    const variants = defaultVariants({ ...baseMeta, width: 3840, height: 2160, bitrateMbps: 80 }, [
      'hevc',
      'avc',
    ])
    expect(variants).toHaveLength(2)
    expect(variants[0]).toMatchObject({ codec: 'hevc', targetHeight: 1080 })
    expect(variants[1]).toMatchObject({ codec: 'avc', targetHeight: 480 })
  })

  it('falls back to AVC primary when HEVC not supported', () => {
    const variants = defaultVariants(
      { ...baseMeta, bitrateMbps: 80 },
      ['avc'] // no hevc
    )
    expect(variants[0].codec).toBe('avc')
  })

  it('skips 480p fallback when source is already ≤480p', () => {
    const variants = defaultVariants({ ...baseMeta, width: 640, height: 360, bitrateMbps: 5 }, [
      'hevc',
      'avc',
    ])
    expect(variants).toHaveLength(1)
  })

  it('omits primary when recommendation is none (source already good)', () => {
    const variants = defaultVariants(
      { ...baseMeta, bitrateMbps: 8, videoCodec: 'hvc1.1', mimeType: 'video/mp4' },
      ['hevc', 'avc']
    )
    // recommendation=none → no primary re-encode, only 480p fallback if source > 480p
    expect(variants).toHaveLength(1)
    expect(variants[0]).toMatchObject({ codec: 'avc', targetHeight: 480 })
  })
})
```

- [ ] **Step 2: Run tests — confirm they all fail**

```bash
npx vitest run src/lib/video-transcode.test.ts 2>&1 | tail -10
```

Expected: `Cannot find module './video-transcode'`

- [ ] **Step 3: Implement `src/lib/video-transcode.ts`**

```ts
import { getCodecsFromFile } from './codec-detection'

// ─── Constants ────────────────────────────────────────────────────────────────

export const BITRATE_CUTOFF_MBPS = 15
const PRIMARY_TARGET_HEIGHT = 1080
const FALLBACK_TARGET_HEIGHT = 480
const BPP_MEDIUM = 0.22

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscodeSourceMeta {
  width: number
  height: number
  duration: number // seconds
  sizeMB: number
  bitrateMbps: number
  videoCodec: string | undefined
  mimeType: string // file.type e.g. 'video/mp4'
}

export type TranscodeRecommendation = 'none' | 'bitrate' | 'full'

export interface BrowserTranscodeVariant {
  codec: 'hevc' | 'avc'
  targetHeight: number
  format: 'mp4'
  label: string // e.g. "1080p HEVC"
}

// ─── Source probing ───────────────────────────────────────────────────────────

/**
 * Probes a File for codec, resolution, duration, and bitrate.
 * Uses MP4Box (getCodecsFromFile) for codec+bitrate when possible,
 * falls back to a video element for other containers.
 */
export async function probeTranscodeSource(file: File): Promise<TranscodeSourceMeta> {
  // Probe dimensions + duration via video element (works for all containers)
  const { width, height, duration } = await probeVideoDimensions(file)

  // Probe codec + bitrate via MP4Box (MP4 only, graceful fail for others)
  let videoCodec: string | undefined
  let bitrateMbps: number = (file.size * 8) / (duration * 1_000_000) // fallback estimate

  try {
    const codecInfo = await getCodecsFromFile(file)
    videoCodec = codecInfo.videoCodec
    if (codecInfo.bitrate && codecInfo.bitrate > 0) {
      bitrateMbps = codecInfo.bitrate / 1_000_000
    }
  } catch {
    // Non-MP4 or too-large file: codec unknown, bitrate estimated from size/duration
  }

  return {
    width,
    height,
    duration,
    sizeMB: file.size / (1024 * 1024),
    bitrateMbps,
    videoCodec,
    mimeType: file.type,
  }
}

async function probeVideoDimensions(
  file: File
): Promise<{ width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Failed to read video metadata'))
      setTimeout(() => reject(new Error('Video metadata timeout')), 10_000)
    })
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ─── Decision ─────────────────────────────────────────────────────────────────

/** Returns true if the codec string is H.264 or H.265/HEVC */
function isCompatibleCodec(codec: string | undefined): boolean {
  if (!codec) return false
  return (
    codec.startsWith('avc1') ||
    codec.startsWith('avc3') ||
    codec.startsWith('hvc1') ||
    codec.startsWith('hev1')
  )
}

function isMp4Container(mimeType: string): boolean {
  return mimeType === 'video/mp4' || mimeType === 'video/x-m4v'
}

/**
 * Decides whether the source needs transcoding.
 *
 * 'full'    → wrong container, unknown/incompatible codec, or height > 1080
 * 'bitrate' → good codec/container/resolution, but bitrate > 15 Mbps
 * 'none'    → already optimised (no primary re-encode needed)
 */
export function assessTranscodeNeed(meta: TranscodeSourceMeta): TranscodeRecommendation {
  if (!isMp4Container(meta.mimeType)) return 'full'
  if (!isCompatibleCodec(meta.videoCodec)) return 'full'
  if (meta.height > PRIMARY_TARGET_HEIGHT) return 'full'
  if (meta.bitrateMbps > BITRATE_CUTOFF_MBPS) return 'bitrate'
  return 'none'
}

// ─── Variant defaults ─────────────────────────────────────────────────────────

/**
 * Computes target width/height from source dimensions and a target height,
 * preserving aspect ratio and clamping to source (no upscaling).
 * Returns even numbers (required by most encoders).
 */
export function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  targetHeight: number
): { width: number; height: number } {
  // For portrait videos the "p" label refers to the short side (width).
  // We always target the short dimension to keep the label meaningful.
  const isPortrait = srcHeight > srcWidth
  const shortSide = isPortrait ? srcWidth : srcHeight
  const longSide = isPortrait ? srcHeight : srcWidth

  // Clamp target to source (no upscaling)
  const clampedShort = Math.min(targetHeight, shortSide)
  const scale = clampedShort / shortSide
  const scaledLong = Math.round(longSide * scale)

  // Make both dimensions even
  const even = (n: number) => (n % 2 === 0 ? n : n + 1)
  const finalShort = even(clampedShort)
  const finalLong = even(scaledLong)

  return isPortrait
    ? { width: finalShort, height: finalLong }
    : { width: finalLong, height: finalShort }
}

/**
 * Returns the default set of variants to produce based on source metadata
 * and the browser's supported codec list.
 *
 * Logic:
 * - If recommendation === 'none': skip primary, only add 480p AVC fallback (if source > 480p)
 * - Otherwise: add HEVC (or AVC if HEVC unsupported) primary + AVC 480p fallback (if source > 480p)
 */
export function defaultVariants(
  meta: TranscodeSourceMeta,
  supportedCodecs: string[]
): BrowserTranscodeVariant[] {
  const recommendation = assessTranscodeNeed(meta)
  const supportsHevc = supportedCodecs.includes('hevc')
  const variants: BrowserTranscodeVariant[] = []

  const shortSide = Math.min(meta.width, meta.height)

  // Primary variant (skip when source is already optimal)
  if (recommendation !== 'none') {
    const primaryHeight = Math.min(PRIMARY_TARGET_HEIGHT, shortSide)
    const primaryCodec: 'hevc' | 'avc' = supportsHevc ? 'hevc' : 'avc'
    const primaryLabel = `${primaryHeight}p ${primaryCodec === 'hevc' ? 'HEVC' : 'H.264'}`
    variants.push({
      codec: primaryCodec,
      targetHeight: primaryHeight,
      format: 'mp4',
      label: primaryLabel,
    })
  }

  // 480p AVC fallback (always, if source is larger than 480p)
  if (shortSide > FALLBACK_TARGET_HEIGHT) {
    variants.push({
      codec: 'avc',
      targetHeight: FALLBACK_TARGET_HEIGHT,
      format: 'mp4',
      label: `${FALLBACK_TARGET_HEIGHT}p H.264`,
    })
  }

  return variants
}

/**
 * Returns true if WebCodecs encoding is available in this browser.
 * Must be called before showing the transcode UI.
 */
export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
}

// ─── Transcode ────────────────────────────────────────────────────────────────

/**
 * Transcodes `file` to the given variant using mediabunny (lazy-loaded).
 * Returns a File with the transcoded MP4 content.
 * Throws DOMException('AbortError') if signal is aborted before execution completes.
 */
export async function transcodeFile(
  file: File,
  variant: BrowserTranscodeVariant,
  sourceMeta: TranscodeSourceMeta,
  onProgress: (progress: number) => void,
  signal: AbortSignal
): Promise<File> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  // Lazy-load mediabunny — only pulled into the bundle when this function is called
  const {
    Input,
    Output,
    Conversion,
    ALL_FORMATS,
    BlobSource,
    Mp4OutputFormat,
    BufferTarget,
    QUALITY_MEDIUM,
  } = await import('mediabunny')

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const { width: targetWidth, height: targetHeight } = computeTargetDimensions(
    sourceMeta.width,
    sourceMeta.height,
    variant.targetHeight
  )

  const targetBitrate = Math.round(targetWidth * targetHeight * 30 * BPP_MEDIUM)

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })

  let conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: {
      width: targetWidth,
      bitrate: targetBitrate,
      codec: variant.codec as Parameters<typeof Conversion.init>[0]['video']['codec'],
      hardwareAcceleration: 'prefer-hardware',
      keyFrameInterval: 2,
    },
    audio: { bitrate: QUALITY_MEDIUM },
    tags: {},
  })

  // Some browsers fail with prefer-hardware for certain codecs/resolutions.
  // Retry with no-preference before giving up.
  if (!conversion.isValid) {
    const input2 = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
    const output2 = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
    conversion = await Conversion.init({
      input: input2,
      output: output2,
      tracks: 'primary',
      video: {
        width: targetWidth,
        bitrate: targetBitrate,
        codec: variant.codec as Parameters<typeof Conversion.init>[0]['video']['codec'],
        hardwareAcceleration: 'no-preference',
        keyFrameInterval: 2,
      },
      audio: { bitrate: QUALITY_MEDIUM },
      tags: {},
    })
  }

  if (!conversion.isValid) {
    throw new Error(
      `Cannot encode ${variant.codec.toUpperCase()} at ${targetWidth}x${targetHeight} in this browser.`
    )
  }

  conversion.onProgress = (p: number) => {
    if (!signal.aborted) onProgress(p)
  }

  await conversion.execute()

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

  const buffer = (output.target as BufferTarget).buffer
  if (!buffer) throw new Error('Transcode produced no output')

  const baseName = file.name.replace(/\.[^.]+$/, '')
  const outName = `${baseName}_${variant.targetHeight}p_${variant.codec}.mp4`
  return new File([buffer], outName, { type: 'video/mp4', lastModified: Date.now() })
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/video-transcode.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-transcode.ts src/lib/video-transcode.test.ts
git commit -m "feat: browser transcode core lib (probe, decide, encode via mediabunny)"
```

---

## Task 3: `useVideoTranscode` hook

**Files:**

- Create: `src/hooks/useVideoTranscode.ts`

This hook manages the async multi-variant transcode sequence. It does NOT depend on `useVideoUpload` — it is a standalone, reusable hook. It loads supported codecs once on mount (lazy, only when the hook is first used).

- [ ] **Step 1: Implement `src/hooks/useVideoTranscode.ts`**

```ts
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  probeTranscodeSource,
  assessTranscodeNeed,
  defaultVariants,
  transcodeFile,
  isWebCodecsSupported,
  type TranscodeSourceMeta,
  type TranscodeRecommendation,
  type BrowserTranscodeVariant,
} from '@/lib/video-transcode'

export type VideoTranscodeStatus =
  | 'idle'
  | 'analyzing'
  | 'waiting' // probe done, showing recommendation card
  | 'transcoding'
  | 'done'
  | 'error'

export interface VariantProgress {
  variant: BrowserTranscodeVariant
  progress: number // 0–1
  status: 'pending' | 'active' | 'done' | 'error'
}

export interface UseVideoTranscodeReturn {
  status: VideoTranscodeStatus
  sourceMeta: TranscodeSourceMeta | null
  recommendation: TranscodeRecommendation | null
  variants: BrowserTranscodeVariant[] // user-editable selection
  variantProgress: VariantProgress[]
  error: string | null
  supported: boolean // false → WebCodecs unavailable
  setVariants: (v: BrowserTranscodeVariant[]) => void
  analyze: (file: File) => Promise<void>
  startTranscode: (file: File) => Promise<File[]>
  cancel: () => void
  reset: () => void
}

export function useVideoTranscode(): UseVideoTranscodeReturn {
  const [status, setStatus] = useState<VideoTranscodeStatus>('idle')
  const [sourceMeta, setSourceMeta] = useState<TranscodeSourceMeta | null>(null)
  const [recommendation, setRecommendation] = useState<TranscodeRecommendation | null>(null)
  const [variants, setVariants] = useState<BrowserTranscodeVariant[]>([])
  const [variantProgress, setVariantProgress] = useState<VariantProgress[]>([])
  const [error, setError] = useState<string | null>(null)
  const [supportedCodecs, setSupportedCodecs] = useState<string[]>([])
  const supported = isWebCodecsSupported()

  const abortRef = useRef<AbortController | null>(null)

  // Load supported codecs once (lazy — only if WebCodecs is available)
  useEffect(() => {
    if (!supported) return
    import('mediabunny')
      .then(({ getEncodableVideoCodecs }) => getEncodableVideoCodecs())
      .then(codecs => setSupportedCodecs(codecs))
      .catch(() => setSupportedCodecs(['avc'])) // safe fallback
  }, [supported])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setSourceMeta(null)
    setRecommendation(null)
    setVariants([])
    setVariantProgress([])
    setError(null)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setVariantProgress([])
    setError(null)
  }, [])

  const analyze = useCallback(
    async (file: File) => {
      if (!supported) return
      setStatus('analyzing')
      setError(null)
      try {
        const meta = await probeTranscodeSource(file)
        const rec = assessTranscodeNeed(meta)
        const vars = defaultVariants(meta, supportedCodecs)
        setSourceMeta(meta)
        setRecommendation(rec)
        setVariants(vars)
        setStatus('waiting')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to analyse video')
        setStatus('error')
      }
    },
    [supported, supportedCodecs]
  )

  const startTranscode = useCallback(
    async (file: File): Promise<File[]> => {
      if (variants.length === 0) return []

      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      setStatus('transcoding')
      setVariantProgress(variants.map(v => ({ variant: v, progress: 0, status: 'pending' })))
      setError(null)

      const results: File[] = []

      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i]

        setVariantProgress(prev =>
          prev.map((vp, idx) => (idx === i ? { ...vp, status: 'active', progress: 0 } : vp))
        )

        try {
          const outFile = await transcodeFile(
            file,
            variant,
            sourceMeta!,
            progress => {
              setVariantProgress(prev =>
                prev.map((vp, idx) => (idx === i ? { ...vp, progress } : vp))
              )
            },
            signal
          )

          results.push(outFile)

          setVariantProgress(prev =>
            prev.map((vp, idx) => (idx === i ? { ...vp, status: 'done', progress: 1 } : vp))
          )
        } catch (err) {
          if (signal.aborted) {
            // User cancelled — propagate via thrown error so caller can handle
            throw new DOMException('Aborted', 'AbortError')
          }
          // Variant failed — mark it but continue with remaining variants
          setVariantProgress(prev =>
            prev.map((vp, idx) => (idx === i ? { ...vp, status: 'error' } : vp))
          )
          console.warn(`[useVideoTranscode] Variant ${variant.label} failed:`, err)
        }
      }

      if (results.length === 0) {
        const err = 'All transcode variants failed. Try uploading the original.'
        setError(err)
        setStatus('error')
        throw new Error(err)
      }

      setStatus('done')
      return results
    },
    [variants, sourceMeta]
  )

  return {
    status,
    sourceMeta,
    recommendation,
    variants,
    variantProgress,
    error,
    supported,
    setVariants,
    analyze,
    startTranscode,
    cancel,
    reset,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | grep -i "video-transcode"
```

Expected: no errors on the new files.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVideoTranscode.ts
git commit -m "feat: useVideoTranscode hook — multi-variant transcode state machine"
```

---

## Task 4: `BrowserTranscodeStep` component

**Files:**

- Create: `src/components/video-upload/BrowserTranscodeStep.tsx`

This component renders inside Step 1 of the upload wizard when `uploadState === 'transcoding'`. It drives the full UI flow: analyzing → recommendation card → progress → done.

- [ ] **Step 1: Implement `src/components/video-upload/BrowserTranscodeStep.tsx`**

```tsx
import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Zap, Upload, X } from 'lucide-react'
import { useVideoTranscode } from '@/hooks/useVideoTranscode'
import type { BrowserTranscodeVariant } from '@/lib/video-transcode'

interface BrowserTranscodeStepProps {
  file: File
  /** Called with transcoded File array when done — caller uploads these */
  onComplete: (files: File[]) => void
  /** Called when user skips transcoding — caller uploads original file */
  onSkip: () => void
}

export function BrowserTranscodeStep({ file, onComplete, onSkip }: BrowserTranscodeStepProps) {
  const { t } = useTranslation()
  const {
    status,
    sourceMeta,
    recommendation,
    variants,
    variantProgress,
    error,
    supported,
    setVariants,
    analyze,
    startTranscode,
    cancel,
  } = useVideoTranscode()

  // Auto-probe on mount
  useEffect(() => {
    if (!supported) return
    analyze(file)
    // analyze is stable (useCallback), file reference won't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If WebCodecs unsupported, immediately skip to regular upload
  useEffect(() => {
    if (!supported) onSkip()
  }, [supported, onSkip])

  const handleStart = useCallback(async () => {
    try {
      const files = await startTranscode(file)
      onComplete(files)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled — stay in idle/waiting state (handled by cancel())
        return
      }
      // Error already set in hook state — nothing else needed
    }
  }, [startTranscode, file, onComplete])

  const toggleVariant = useCallback(
    (variant: BrowserTranscodeVariant) => {
      setVariants(prev => {
        const exists = prev.some(v => v.label === variant.label)
        if (exists) return prev.filter(v => v.label !== variant.label)
        return [...prev, variant]
      })
    },
    [setVariants]
  )

  // ── Analyzing ──────────────────────────────────────────────────────────────
  if (status === 'analyzing') {
    return (
      <Alert className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950">
        <Loader2 className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-spin" />
        <AlertTitle className="text-violet-800 dark:text-violet-200">
          {t('upload.browserTranscode.analyzing', { defaultValue: 'Analysing video…' })}
        </AlertTitle>
      </Alert>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <X className="h-4 w-4" />
        <AlertTitle>
          {t('upload.browserTranscode.errorTitle', { defaultValue: 'Transcode failed' })}
        </AlertTitle>
        <AlertDescription>
          <p className="mb-3">{error}</p>
          <Button size="sm" variant="outline" onClick={onSkip} className="cursor-pointer">
            <Upload className="h-4 w-4 mr-2" />
            {t('upload.browserTranscode.uploadOriginal', { defaultValue: 'Upload original' })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  // ── Waiting (recommendation card) ─────────────────────────────────────────
  if (status === 'waiting' && sourceMeta) {
    const shortSide = Math.min(sourceMeta.width, sourceMeta.height)
    const longSide = Math.max(sourceMeta.width, sourceMeta.height)
    const durationMin = Math.floor(sourceMeta.duration / 60)
    const durationSec = Math.round(sourceMeta.duration % 60)
    const durationStr = `${durationMin}:${durationSec.toString().padStart(2, '0')}`
    const sizeMBStr = sourceMeta.sizeMB.toFixed(0)

    const recommendationMessage =
      recommendation === 'full'
        ? t('upload.browserTranscode.recommendFull', {
            defaultValue:
              'Your video needs conversion for Nostr compatibility (wrong container or codec).',
          })
        : recommendation === 'bitrate'
          ? t('upload.browserTranscode.recommendBitrate', {
              bitrate: sourceMeta.bitrateMbps.toFixed(0),
              defaultValue:
                'Your video is well-encoded but at {{bitrate}} Mbps — a re-encode will reduce file size significantly.',
            })
          : t('upload.browserTranscode.recommendNone', {
              defaultValue: 'Your video is already optimised — only creating the 480p fallback.',
            })

    return (
      <Alert className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950">
        <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        <AlertTitle className="text-violet-800 dark:text-violet-200">
          {t('upload.browserTranscode.title', { defaultValue: 'Optimise for Nostr' })}
        </AlertTitle>
        <AlertDescription className="text-violet-700 dark:text-violet-300 space-y-3">
          <p className="text-sm text-muted-foreground">
            {longSide}×{shortSide} · {durationStr} · {sizeMBStr} MB ·{' '}
            {sourceMeta.bitrateMbps.toFixed(0)} Mbps
          </p>
          <p>{recommendationMessage}</p>

          {variants.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {variants.map(variant => (
                  <label key={variant.label} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => toggleVariant(variant)}
                      className="cursor-pointer"
                    />
                    <span className="text-sm">{variant.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={variants.length === 0}
                  className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {t('upload.browserTranscode.optimiseUpload', {
                    defaultValue: 'Optimise & Upload',
                  })}
                </Button>
                <Button size="sm" variant="outline" onClick={onSkip} className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  {t('upload.browserTranscode.uploadOriginal', { defaultValue: 'Upload original' })}
                </Button>
              </div>
            </>
          ) : (
            // No variants to produce (source already small + AVC 480p or smaller)
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={onSkip} className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                {t('upload.browserTranscode.uploadOriginal', { defaultValue: 'Upload original' })}
              </Button>
            </div>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  // ── Transcoding ────────────────────────────────────────────────────────────
  if (status === 'transcoding') {
    return (
      <Alert className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950">
        <Loader2 className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-spin" />
        <AlertTitle className="text-violet-800 dark:text-violet-200">
          {t('upload.browserTranscode.transcoding', { defaultValue: 'Optimising video…' })}
        </AlertTitle>
        <AlertDescription className="text-violet-700 dark:text-violet-300 space-y-3">
          {variantProgress.map(vp => (
            <div key={vp.variant.label} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{vp.variant.label}</span>
                <span>
                  {vp.status === 'done'
                    ? '✓'
                    : vp.status === 'active'
                      ? `${Math.round(vp.progress * 100)}%`
                      : vp.status === 'error'
                        ? '✗'
                        : '…'}
                </span>
              </div>
              {vp.status === 'active' && (
                <Progress value={vp.progress * 100} className="h-1.5 [&>div]:bg-violet-500" />
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              cancel()
              onSkip()
            }}
            className="cursor-pointer mt-2"
          >
            <X className="h-4 w-4 mr-2" />
            {t('upload.browserTranscode.cancel', { defaultValue: 'Cancel — upload original' })}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return null
}
```

- [ ] **Step 2: Export from the video-upload index**

Open `src/components/video-upload/index.ts` and add:

```ts
export { BrowserTranscodeStep } from './BrowserTranscodeStep'
```

(Add it alongside the existing exports — match the file's current style.)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | grep "BrowserTranscode"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/video-upload/BrowserTranscodeStep.tsx src/components/video-upload/index.ts
git commit -m "feat: BrowserTranscodeStep component — probe, recommend, transcode UI"
```

---

## Task 5: Update `useVideoUpload` — add transcoding state and handlers

**Files:**

- Modify: `src/hooks/useVideoUpload.ts`

### What changes

1. The `uploadState` type gains `'transcoding'` as a valid value.
2. `onDrop` no longer calls `fileUpload.upload()` directly. It sets `uploadState = 'transcoding'` and stores the file, then stops. The actual upload is triggered by the new callback handlers below.
3. Two new exported handlers: `handleBrowserTranscodeComplete` and `handleBrowserTranscodeSkip`.
4. Both handlers share the inner upload logic extracted into `uploadFileAndProcess`.

- [ ] **Step 1: Add `'transcoding'` to the state type**

In `src/hooks/useVideoUpload.ts`, find the line:

```ts
  const [uploadState, setUploadState] = useState<'initial' | 'uploading' | 'finished'>(
```

Replace with:

```ts
  const [uploadState, setUploadState] = useState<'initial' | 'transcoding' | 'uploading' | 'finished'>(
```

- [ ] **Step 2: Replace `onDrop` and add new handlers**

Find the existing `const onDrop = async (acceptedFiles: File[]) => {` function (starts around line 429 in the current file). Replace the entire function plus add two new handlers immediately after it:

```ts
const onDrop = async (acceptedFiles: File[]) => {
  if (
    !acceptedFiles[0] ||
    !blossomInitalUploadServers ||
    blossomInitalUploadServers.length === 0 ||
    !user
  ) {
    return
  }

  const droppedFile = acceptedFiles[0]
  setFile(droppedFile)
  setUploadInfo({ videos: [] })
  setUploadProgress(null)

  // isWebCodecsSupported is a synchronous check — no import needed here
  // BrowserTranscodeStep handles the case where WebCodecs is unavailable by calling onSkip immediately
  setUploadState('transcoding')
}

/** Shared inner logic: upload one File, probe it, return VideoVariant */
const uploadFileAndProcess = async (fileToUpload: File) => {
  const result = await fileUpload.upload(fileToUpload)
  const videoVariant = await processUploadedVideo(fileToUpload, result.uploadedBlobs)
  return { ...videoVariant, mirroredBlobs: result.mirroredBlobs }
}

/**
 * Called by BrowserTranscodeStep when transcoding succeeds.
 * Receives one or two transcoded Files (primary + fallback) and uploads them all.
 */
const handleBrowserTranscodeComplete = async (transcodedFiles: File[]) => {
  setUploadState('uploading')
  setUploadProgress(null)

  try {
    const variants = []
    for (const f of transcodedFiles) {
      // eslint-disable-next-line no-await-in-loop
      const variant = await uploadFileAndProcess(f)
      variants.push(variant)
    }
    setUploadInfo({ videos: variants })
  } catch (error) {
    console.error('Upload after browser transcode failed:', error)
    setUploadState('initial')
    setUploadInfo({ videos: [] })
    setUploadProgress(null)
    if (error instanceof Error) {
      alert(`Upload failed: ${error.message}`)
    } else {
      alert('Upload failed due to an unknown error. Please try again.')
    }
    return
  }

  setUploadState('finished')
  setUploadProgress(null)
}

/**
 * Called by BrowserTranscodeStep when the user skips transcoding.
 * Falls back to uploading the raw original file.
 */
const handleBrowserTranscodeSkip = async () => {
  if (!file || !blossomInitalUploadServers || blossomInitalUploadServers.length === 0 || !user) {
    setUploadState('initial')
    return
  }

  setUploadState('uploading')
  setUploadProgress(null)

  try {
    const variant = await uploadFileAndProcess(file)
    setUploadInfo({ videos: [variant] })
  } catch (error) {
    console.error('BUD-10 upload failed:', error)
    setUploadState('initial')
    setUploadInfo({ videos: [] })
    setUploadProgress(null)
    if (error instanceof Error) {
      alert(`Upload failed: ${error.message}`)
    } else {
      alert('Upload failed due to an unknown error. Please try again.')
    }
    return
  }

  setUploadState('finished')
  setUploadProgress(null)
}
```

- [ ] **Step 3: Export the two new handlers**

In the `return { ... }` block at the bottom of `useVideoUpload`, add the two new handlers alongside the existing ones:

```ts
    handleBrowserTranscodeComplete,
    handleBrowserTranscodeSkip,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck 2>&1 | grep -i "useVideoUpload\|transcod"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useVideoUpload.ts
git commit -m "feat: useVideoUpload — add transcoding state and browser transcode handlers"
```

---

## Task 6: Wire `BrowserTranscodeStep` into `VideoUpload.tsx`

**Files:**

- Modify: `src/components/VideoUpload.tsx`

### What changes

1. Import `BrowserTranscodeStep` and the two new handlers from `useVideoUpload`.
2. Hide the `FileDropzone` when `uploadState === 'transcoding'`.
3. Render `BrowserTranscodeStep` between the dropzone section and the upload-progress section when `uploadState === 'transcoding'`.

- [ ] **Step 1: Add the import**

Find the existing import from `'./video-upload'` (around line 10–21). Add `BrowserTranscodeStep` to it:

```ts
import {
  InputMethodSelector,
  UrlInputSection,
  FileDropzone,
  FormFields,
  ContentWarning,
  ThumbnailSection,
  ExpirationSection,
  PublishDateSection,
  DvmTranscodeAlert,
  EventPreview,
  SubtitleSection,
  PeoplePickerSection,
  OriginManager,
  BrowserTranscodeStep,
} from './video-upload'
```

- [ ] **Step 2: Destructure the two new handlers from `videoUploadState`**

Find the destructuring of `videoUploadState` around line 69. Add the two new handlers:

```ts
    handleBrowserTranscodeComplete,
    handleBrowserTranscodeSkip,
```

(Add them alongside `handleAddTranscodedVideo`, `handleAddVideo`, etc.)

- [ ] **Step 3: Update the FileDropzone render condition**

Find this block (around line 528):

```tsx
                {/* File upload */}
                {uploadInfo.videos.length === 0 && inputMethod === 'file' && (
                  <FileDropzone
```

Change the condition to also hide the dropzone during transcoding:

```tsx
                {/* File upload */}
                {uploadInfo.videos.length === 0 &&
                  inputMethod === 'file' &&
                  uploadState !== 'transcoding' && (
                  <FileDropzone
```

- [ ] **Step 4: Add the `BrowserTranscodeStep` render block**

Immediately after the `FileDropzone` block (and before the upload progress block at line 538), add:

```tsx
{
  /* Browser transcode step — shown after drop, before upload */
}
{
  uploadState === 'transcoding' && file && inputMethod === 'file' && (
    <BrowserTranscodeStep
      file={file}
      onComplete={handleBrowserTranscodeComplete}
      onSkip={handleBrowserTranscodeSkip}
    />
  )
}
```

- [ ] **Step 5: Build to confirm no errors**

```bash
npm run build 2>&1 | grep -E "error|Error" | grep -v "console"
```

Expected: no TypeScript or build errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/VideoUpload.tsx
git commit -m "feat: wire BrowserTranscodeStep into upload wizard step 1"
```

---

## Task 7: i18n keys

**Files:**

- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/de.json`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/es.json`

- [ ] **Step 1: Add keys to `en.json`**

Open `src/i18n/locales/en.json`. Find the `"upload"` object and add a `"browserTranscode"` key inside it (alongside the existing `"transcode"` key):

```json
    "browserTranscode": {
      "analyzing": "Analysing video…",
      "title": "Optimise for Nostr",
      "recommendFull": "Your video needs conversion for Nostr compatibility (wrong container or codec).",
      "recommendBitrate": "Your video is well-encoded but at {{bitrate}} Mbps — a re-encode will reduce file size significantly.",
      "recommendNone": "Your video is already optimised — only creating the 480p fallback.",
      "optimiseUpload": "Optimise & Upload",
      "uploadOriginal": "Upload original",
      "transcoding": "Optimising video…",
      "cancel": "Cancel — upload original",
      "errorTitle": "Transcode failed"
    }
```

- [ ] **Step 2: Add stub keys to de.json, fr.json, es.json**

Add the same block verbatim (English text) to each of the other three locale files at the same position inside `"upload"`. i18next falls back to English when a key is missing, but having the key present prevents console warnings.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/en.json src/i18n/locales/de.json src/i18n/locales/fr.json src/i18n/locales/es.json
git commit -m "feat: i18n keys for browser transcode step"
```

---

## Task 8: Build, format, CHANGELOG

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Full build**

```bash
npm run build 2>&1 | tail -10
```

Expected: exits 0. There will be a chunk-size warning for mediabunny (it is lazy-loaded but Rollup may still warn). That is pre-existing behaviour — not a failure.

- [ ] **Step 2: Format**

```bash
npm run format
```

- [ ] **Step 3: Update CHANGELOG.md**

Under `## [Unreleased]` → `### Added`, add:

```markdown
- In-browser video transcoding before upload — when a file is dropped, NosTube probes the source (codec, resolution, bitrate) and offers to optimise it in-browser via WebCodecs (mediabunny) before uploading to Blossom; produces HEVC 1080p primary + H.264 480p fallback by default; transcoding is suggested but skippable; uses 15 Mbps as the re-encode threshold even for already-compatible codecs; DVM transcoding continues to work for any remaining resolutions; falls back gracefully to direct upload when WebCodecs is unavailable
```

- [ ] **Step 4: Final commit**

```bash
git add -u
git commit -m "chore: format and update CHANGELOG for browser transcode feature"
```

---

## Self-Review

**Spec coverage check:**

| Requirement                                    | Task                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Suggested but not automatic (skip button)      | Task 4 — `BrowserTranscodeStep` waiting state has "Upload original"                                         |
| HEVC+MP4 primary, AVC 480p fallback            | Task 2 — `defaultVariants`                                                                                  |
| Default resolution 1080p, capped to source     | Task 2 — `computeTargetDimensions`                                                                          |
| 15 Mbps bitrate cutoff                         | Task 2 — `BITRATE_CUTOFF_MBPS = 15`, `assessTranscodeNeed`                                                  |
| Multiple resolutions from browser, not DVM     | Tasks 5+6 — sequential upload of all transcoded files                                                       |
| DVM alert unchanged, sees existing resolutions | No DVM changes needed — `existingResolutions` prop already filters                                          |
| Lazy-load mediabunny                           | Task 2 — `await import('mediabunny')` inside `transcodeFile` + Task 3 — `import('mediabunny')` in useEffect |
| WebCodecs unavailability → skip to upload      | Task 3 — `useVideoTranscode.supported`, Task 4 — auto-skip effect                                           |
| No worker for MVP                              | Intentional — noted in plan header                                                                          |

**Placeholder scan:** none found — all steps contain complete code.

**Type consistency:** `BrowserTranscodeVariant` defined in Task 2, used in Tasks 3+4 with matching shape. `TranscodeSourceMeta` defined in Task 2, passed through Tasks 3→4→5. `handleBrowserTranscodeComplete(files: File[])` defined in Task 5 and wired in Task 6 with matching signature. `handleBrowserTranscodeSkip()` same.
