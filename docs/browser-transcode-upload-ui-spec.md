# Browser Transcode Upload UI Spec

## Goal

Improve the browser-based transcode step in the upload flow without changing the core upload/transcode capabilities. The new UI should keep every current input and state, but make the settings step cleaner and move progress into a dedicated follow-up screen once the job starts.

Reference prototype:

- `docs/prototypes/browser-transcode-upload-ui.html`

## Current Surface

The current UI lives mainly in:

- `src/components/video-upload/BrowserTranscodeStep.tsx`
- `src/components/VideoUpload.tsx`
- `src/hooks/useVideoTranscode.ts`
- `src/lib/browser-transcode-upload-manager.ts`
- `src/types/upload-draft.ts`

Current capabilities that must remain:

- File upload and URL upload entry paths remain in `VideoUpload`.
- Browser transcode analysis runs after a file is selected.
- Output format selection supports `mp4` and `hls`.
- Resolution selection supports all currently available resolution options.
- HLS can include a passthrough source variant when `canUseOriginalHlsVariant(sourceMeta)` is true.
- MP4 can keep/upload the original explicitly.
- User can upload original only when transcode is unsupported or no variants are available.
- Background state can show queued/transcoding/uploading/complete/error/cancelled.
- Per-variant progress and upload progress remain visible.
- HLS preview remains available after a complete HLS upload.

## UX Direction

### Screen 1: Settings

This screen is shown while `BrowserTranscodeStep` is in the pre-run state:

- no `backgroundState`
- supported browser
- `status === "waiting"`
- `sourceMeta` is available

Primary changes:

- Keep the existing Upload panel metadata as the source of truth for file information.
- Make `Optimise for Nostr` a compact toolbar, not a large alert/banner.
- Show estimated output inline in that toolbar.
- For HLS, label the estimate as total output for selected variants. Do not imply a percent savings.
- For MP4 or a single selected variant, a future enhancement may show percent savings, but this is optional.
- Move the original file into the resolution/options list when it is selectable.
- Do not show a separate “keep original when exporting” checkbox in the lower-left corner.
- Keep the primary action dynamic:
  - HLS: `Generate HLS & Upload`
  - MP4: `Optimise & Upload`
  - Fallback/original-only: `Upload`

Settings layout:

- Output format section:
  - `MP4`
  - `HLS Adaptive`
- Resolution/options section:
  - For HLS with passthrough support, include `Source / Original` as the first row.
  - The source row label should be dynamic, for example `2160p · HEVC`, `1080p · H.264`, or whatever `sourceMeta` detects.
  - Do not assume original means 4K.
  - Transcoded rows continue to show `1080p`, `720p`, `360p`, etc. with codec labels.
- Footer actions:
  - Secondary: `Upload original only`
  - Primary: dynamic transcode/upload action

### Screen 2: Progress

This is a dedicated screen after the user starts browser transcode/upload.

It is shown when:

- `backgroundState.status` is `queued`, `transcoding`, or `uploading`
- or local hook status is `transcoding` for non-background usage

Primary rules:

- Settings are locked while this screen is active.
- Do not offer `Back to settings`.
- The only interruption action is `Cancel`.
- If cancellation is not technically safe for a given phase, disable `Cancel` or show a confirmation before aborting.

Progress layout:

- Header:
  - `Optimising and uploading`
  - Short description that settings are locked.
- Background progress rail:
  - Analysed source
  - Optimising video
  - Uploading files
- Summary cards:
  - Overall progress
  - Output format
  - Files uploaded/generated
- Variant progress:
  - Source/original row when included
  - One row per transcoded variant
  - Status values: waiting, active percent, done, error
- Upload progress:
  - Show chunk/file count and bytes when `backgroundState.uploadProgress` exists.
- Completion:
  - Replace progress body with complete state.
  - If HLS preview URL exists, show `Preview HLS`.
  - Continue to metadata/next upload step remains the normal upload flow action.

### Mobile

Mobile should not only be a squeezed desktop layout. It needs a purpose-built hierarchy:

- Compact top bar with step/state.
- File summary card.
- Compact `Optimise for Nostr` panel.
- Segmented format control.
- Resolution/options list with tap-friendly rows.
- Sticky primary action at the bottom of Screen 1.
- Dedicated progress Screen 2 with:
  - large overall percent
  - ETA
  - progress rail
  - variant progress
  - sticky `Cancel`

## Data And State Model

Existing `BrowserTranscodeState` is mostly sufficient:

```ts
export interface BrowserTranscodeState {
  status: 'queued' | 'transcoding' | 'uploading' | 'complete' | 'error' | 'cancelled'
  mode: 'replace' | 'append'
  keepOriginal: boolean
  sourceName: string
  sourceSize: number
  startedAt: number
  updatedAt: number
  completedAt?: number
  variants: BrowserTranscodeVariantState[]
  uploadProgress?: {
    uploadedBytes: number
    totalBytes: number
    percentage: number
    currentChunk: number
    totalChunks: number
    speedMBps?: number
  }
  message?: string
  error?: string
}
```

Recommended additions are optional but useful:

- Store selected `outputFormat` in the browser transcode job state, or derive it from variants.
- Store source meta snapshot in the job state:
  - width
  - height
  - duration
  - videoCodec
  - mimeType
  - sizeMB
- Store upload file count for HLS jobs if `uploadProgress.totalChunks` is not enough to explain HLS file progress.

Do not block implementation on these additions if equivalent information is already available from `originalVideoInfo`, `sourceMeta`, or generated variants.

## Component Plan

Keep `BrowserTranscodeStep` as the public entry component for now, but split its render logic into smaller components.

Suggested components:

- `BrowserTranscodeStep`
  - orchestrates hook state, background state, handlers, and conditional screen selection
- `BrowserTranscodeSettingsScreen`
  - renders Screen 1 settings
  - owns no transcode side effects
  - receives selected format, selected heights, source row availability, estimate, and callbacks
- `BrowserTranscodeProgressScreen`
  - renders Screen 2 progress
  - supports background and local progress shape
  - receives cancel callback
- `TranscodeFormatSelector`
- `TranscodeVariantOptionList`
- `TranscodeProgressRail`
- `TranscodeVariantProgressList`
- `TranscodeEstimate`

This split keeps the existing API into `VideoUpload` stable while making the UI easier to test.

## Estimate Rules

Use the existing `estimateVariantSizeMB` logic as the starting point.

Screen 1 estimate copy:

- HLS multiple variants: `Estimated output: {{size}} total`
- HLS single variant: `Estimated output: {{size}}`
- MP4 without original: `Estimated output: {{size}}`
- MP4 with original included: `Estimated output: {{size}} total`

Avoid:

- `about X% smaller` for HLS multiple variants
- implying savings when selected variants may exceed source size

Optional future copy:

- If exactly one output file/variant is selected and estimate is lower than source:
  - `about {{percent}} smaller`
- If estimate is higher than source:
  - `larger than source`

## Source / Original Variant Rules

For HLS:

- Show `Source / Original` in the resolution list only when `canUseOriginalHlsVariant(sourceMeta)` is true.
- Treat this as a selectable passthrough variant.
- Label with detected source short-side and codec:
  - `2160p · HEVC`
  - `1080p · H.264`
  - etc.
- Do not hardcode 4K semantics.

For MP4:

- The current `keepOriginal` behavior can remain, but visually it should be represented as an option row rather than a lower-left checkbox.
- If implementing MP4 original-as-row is too risky in the first pass, keep MP4 behavior unchanged internally and only map the UI row to `keepOriginal`.

## Accessibility

- Use semantic controls:
  - radio group or toggle group for format
  - checkboxes for variant options
  - buttons for actions
- Every progress bar should have a text label and percent.
- Do not rely on color alone for progress status.
- Keep tap targets at least 36px high on mobile.
- The sticky mobile action area must not cover content; add bottom padding to scroll content.

## Implementation Task List

### Phase 1: Refactor Without Behavior Change

1. Extract `BrowserTranscodeSettingsScreen` from the current `status === "waiting"` render branch in `BrowserTranscodeStep.tsx`.
2. Extract `BrowserTranscodeProgressScreen` from the current `status === "transcoding"` and `backgroundState` progress branches.
3. Extract shared rows:
   - `TranscodeVariantOptionList`
   - `TranscodeVariantProgressList`
4. Keep existing handlers and state in `BrowserTranscodeStep`.
5. Add focused tests that existing waiting/transcoding/error/complete states still render.

### Phase 2: Settings UI

1. Replace the current alert-style settings UI with the compact panel layout.
2. Remove duplicated source badges under `Optimise for Nostr`.
3. Convert the estimate to compact inline copy.
4. Update estimate copy to avoid percent savings for HLS multi-variant output.
5. Move `keepOriginal` into the options list as `Source / Original` where applicable.
6. Keep the original-only fallback action available.
7. Verify MP4 button copy changes when output format changes.

### Phase 3: HLS Source Variant

1. Add a helper that returns display metadata for the source/original row:
   - label: `Source / Original`
   - detail: `${shortSide}p · ${codecLabel}`
   - enabled only when passthrough is possible for HLS
2. Ensure `computeVariants()` still marks the matching HLS variant as `passthrough: true`.
3. Ensure source/original selection maps correctly when selected/deselected.
4. Add tests for:
   - source row appears when passthrough is possible
   - source row does not appear for incompatible source/container
   - original label is not hardcoded to 4K

### Phase 4: Dedicated Progress Screen

1. Route active `backgroundState` and local `status === "transcoding"` to the new progress screen.
2. Remove any “Back to settings” affordance once the job has started.
3. Show `Cancel` only when `cancel` is valid for the current path.
4. Render progress rail based on:
   - analysis done
   - transcode active/done
   - upload pending/active/done
5. Render variant progress from `backgroundState.variants` or `variantProgress`.
6. Render upload progress when `backgroundState.uploadProgress` exists.
7. Keep complete/error states in the same screen family.

### Phase 5: Mobile

1. Add responsive styles for settings:
   - compact source card
   - segmented format selector
   - full-width variant rows
   - sticky primary action
2. Add responsive styles for progress:
   - large overall percent
   - ETA near the percent
   - progress rail before variant details
   - sticky cancel action
3. Test at 375px, 390px, and desktop widths.
4. Check that no button text overflows.

### Phase 6: Verification

1. Run `npm run typecheck`.
2. Run targeted tests for transcode helpers and upload UI.
3. Run `npm run test` before merging.
4. Manual QA:
   - supported browser, HLS path
   - supported browser, MP4 path
   - unsupported browser fallback
   - no available lower variants
   - HLS passthrough source available
   - HLS passthrough source unavailable
   - cancellation during transcode
   - upload progress during HLS upload
   - complete state with HLS preview
   - mobile viewport

## Acceptance Criteria

- The settings screen keeps all current user choices.
- The settings screen no longer duplicates source metadata under `Optimise for Nostr`.
- `Source / Original` is represented as an option row where appropriate.
- The original/source row uses detected metadata and does not assume 4K.
- HLS estimate copy does not claim percent savings for multiple variants.
- Active transcode/upload shows a dedicated progress screen.
- Active progress screen does not offer `Back to settings`.
- Mobile has a clear sticky primary action on settings and sticky cancel on progress.
- Existing upload, background transcode, HLS preview, and original-only fallback behavior still works.
