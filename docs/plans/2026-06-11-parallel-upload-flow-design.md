# Parallel Upload Flow — Design

Status: approved design, ready for implementation planning.
Companion spec: `docs/browser-transcode-upload-ui-spec.md` (transcode-step internals; still applies, consumed by Screen 1 below).

## 1. Goal

Restructure the upload wizard so the user enters metadata **while** transcode/upload runs in the background, instead of waiting on a blocking step. Every existing feature is preserved — only relocated. The 6-step wizard becomes 3 screens:

| New screen | Replaces old steps | Purpose |
| --- | --- | --- |
| **Source** | 1 (Upload Video) + 2 (Transcode Settings) | Pick file/URL, confirm optimise settings, start background job |
| **Details** | 3 (Details) + 4 (Thumbnail) + 5 (Subtitles) + 6's form content | All metadata on one scrollable form, with a persistent processing rail |
| **Review** | 6's publish action | Readiness checklist, relay selection, event preview, Publish |

### Non-goals

- No changes to upload/transcode engines: `src/lib/browser-transcode-upload-manager.ts`, `src/lib/blossom-upload.ts`, `src/lib/video-transcode.ts`, DVM session code, `UploadManagerProvider` stay untouched.
- No changes to the publish event building (`buildVideoEvent` in `useVideoUpload.ts`) or `runVideoPublishingWorkflow`.
- No draft storage format change beyond what §8 specifies.
- Mobile gets responsive treatment (§10) but no separate component tree.

## 2. Current state (read this first)

### Key files

| File | Role | Size |
| --- | --- | --- |
| `src/components/VideoUpload.tsx` | The whole wizard: 6-step state machine + footer nav + server-config dialogs | ~980 lines |
| `src/hooks/useVideoUpload.ts` | All upload state + handlers (form fields, file/url processing, thumbnail, subtitles, browser-transcode job wiring, publish) | ~1300 lines |
| `src/components/video-upload/BrowserTranscodeStep.tsx` | Transcode settings + progress UI (`forwardRef`, exposes `BrowserTranscodeStepHandle.start()`) | ~1000 lines |
| `src/pages/UploadPage.tsx` | Draft selection shell: `DraftPicker` ↔ `VideoUpload` | |
| `src/hooks/useUploadDrafts.ts` | Draft CRUD, localStorage key `nostube_upload_drafts`, MAX_DRAFTS=10, Nostr sync flush | |
| `src/types/upload-draft.ts` | `UploadDraft`, `BrowserTranscodeState`, `OriginalVideoInfo` | |
| `src/components/video-upload/index.ts` | Barrel for all step components | |

### Current step machine (in `VideoUpload.tsx`)

- `currentStep` (1–6) is local state, initialized from `?step=` query param (valid range 1–6).
- Gating booleans (lines ~476–498):
  - `canProceedToStep2 = inputMethod === 'file' ? !!file : uploadInfo.videos.length > 0`
  - `canProceedToStep3 = uploadInfo.videos.length > 0`
  - `canProceedToStep4 = title.trim().length > 0`
  - `canProceedToStep5 = hasThumbnailSet` where `hasThumbnailSet = thumbnailBlob || thumbnail || thumbnailUploadInfo.uploadedBlobs.length > 0`
  - `canPublish = videos > 0 && title && hasThumbnailSet && !isTranscoding` where `isTranscoding = transcodeStatus === 'transcoding' || 'mirroring'` (DVM status, set by `DvmTranscodeAlert.onStatusChange`)
  - `shouldShowBrowserTranscodeStep = inputMethod === 'file' && (uploadState === 'transcoding' || !!browserTranscodeState)`
- The footer "Next" button doubles as the transcode primary action: when `browserTranscodeActionVisible`, clicking it calls `browserTranscodeRef.current?.start()` instead of advancing. `BrowserTranscodeStep` reports its action via `onPrimaryActionChange(BrowserTranscodePrimaryActionState)` (`{label, disabled, visible}`) because the step renders with `hidePrimaryAction`.
- An effect auto-advances 1→2 when `uploadState === 'transcoding'` for file input.
- `handleSubmit` refuses to run unless `currentStep === 6` and contains the `justArrivedAtStep5` 500 ms anti-double-click hack.
- **Verbatim duplication**: steps 1 and 2 both render the same block — upload progress spinner/bar, `VideoVariantsTable`, `DvmTranscodeAlert`, "Add another quality" dropzone (lines ~604–661 ≡ ~684–741).

### Background job plumbing (already works; reuse as-is)

- `useVideoUpload` wires `handleStartBrowserTranscodeUpload(file, variants, opts)` → `startBrowserTranscodeUploadJob` in `browser-transcode-upload-manager.ts`. The job survives navigation; state streams back via `subscribeToBrowserTranscodeUploads` into `browserTranscodeState: BrowserTranscodeState | null` (persisted per draft).
- `BrowserTranscodeState.status ∈ queued | transcoding | uploading | complete | error | cancelled`, with `variants[]`, `uploadProgress`, `mirrorProgress`, `segmentStates`, `mirrorSegmentStates`, `message`, `error` (see `src/types/upload-draft.ts`).
- `handleCancelBrowserTranscodeUpload`, `handleBrowserTranscodeComplete`, `handleBrowserTranscodeSkip` already exist in `useVideoUpload`.
- Completion notifications: `useUploadNotifications` (bell icon), keyed by draft id.

### Thumbnail mechanics (important for §6)

- `ThumbnailSection` props: `{thumbnailSource: 'generated'|'upload', onThumbnailSourceChange, thumbnailBlob, onThumbnailDrop, onDeleteThumbnail, isThumbDragActive, thumbnailUploadInfo, videoUrl?}`.
- In the `generated` tab it already loads `videoUrl` into a hidden `<video>`, captures the current frame to a canvas on `loadeddata`/`seeked` into local `previewBlob` (webp, q=0.85), and has a time slider. But committing requires the user to click "Set thumbnail", which calls `onThumbnailDrop([File])` → `handleThumbnailDrop` → **immediate** Blossom upload.
- `useVideoUpload.handleSubmit` already contains a deferred-upload branch: `if (thumbnailSource === 'generated' && thumbnailBlob) { upload at publish time }` (~line 919). However `setThumbnailBlob` is currently never called with a captured frame — this branch is effectively dormant. **We will use it** for auto-capture (§6), avoiding wasted uploads of frames the user replaces.

### Deep links

- `UploadPage` honors `?draft=<id>`; auto-creates an ephemeral draft when none exist.
- `VideoNotesPage.handleImport` navigates to `` `/upload?draft=${draft.id}&step=2` `` after creating a URL-input draft. (Today this lands on the "Browser transcode is only used for local file uploads" placeholder — a wart fixed by the new mapping in §8.)

## 3. New architecture

### Orchestrator

`VideoUpload.tsx` keeps its public contract (`{draft, onBack, onPersist}: UploadFormProps`, rendered by `UploadPage`) but shrinks to an orchestrator:

```ts
type UploadScreen = 'source' | 'details' | 'review'
```

- Holds: `screen` state, `useVideoUpload(draft, handleDraftChange)` (unchanged), DVM `transcodeStatus`, the Blossom-onboarding dialog state/handlers (moved into `UploadSourceScreen` if cleaner, but the dialogs may stay in the orchestrator since `BlossomOnboardingStep`/`BlossomServerPicker` dialogs are global overlays), delete-draft dialog state, and the wrapped `handleSubmit`.
- Renders exactly one screen component plus the shared dialogs (`UploadOnboardingDialog`, `DeleteVideoDialog`, `DeleteDraftDialog`, Blossom dialogs).
- The single `<form onSubmit={handleSubmit}>` wrapper moves to `UploadReviewScreen` only (publish is the only submit). Source/Details use plain `<div>`s — this kills both the `currentStep !== 6` submit guard and the `justArrivedAtStep5` hack. Delete both.
- The footer back/save-draft/delete-draft buttons become a shared `UploadFlowFooter` rendered by the orchestrator (see §7 navigation).

### New components (all under `src/components/video-upload/`, exported via the barrel)

| Component | Contents | Sources from old code |
| --- | --- | --- |
| `UploadSourceScreen` | Input method selection, dropzone/URL, transcode settings, advanced server disclosure | step 1 + step 2 render branches |
| `UploadDetailsScreen` | Metadata form + `ProcessingRail` + accordions | steps 3, 4, 5, 6 render branches |
| `UploadReviewScreen` | Preview card, checklist, relay picker, `EventPreview`, `PublishButton` | step 6 footer + `EventPreview` |
| `ProcessingRail` | Compact live progress for `BrowserTranscodeState` / `uploadState`; expands to `VideoFilesPanel` on completion | new; renders state already produced |
| `VideoFilesPanel` | `VideoVariantsTable` + `DvmTranscodeAlert` + add-another-quality dropzone + HLS preview link | the duplicated block from steps 1–2 (dedupe!) |

Props are plain pass-through from `videoUploadState`; none of these components own side effects except `VideoFilesPanel`'s dropzone (`useDropzone` moves in with it).

## 4. Screen 1 — Source

Render states, in order of precedence:

1. **No video yet** (`uploadInfo.videos.length === 0 && !file`):
   - `InputMethodSelector` (file/url) — unchanged component.
   - File mode: `FileDropzone` with `accept={{'video/*': []}}`, `onDrop = wrappedOnDrop` (persists ephemeral draft via `onPersist` before processing — keep this exact ordering).
   - URL mode: `UrlInputSection` (unchanged; `onProcess` persists then `handleUrlVideoProcessing`). On successful URL processing (`uploadInfo.videos.length > 0`), **auto-advance to `details`**.
   - The server info bar ("X upload / Y mirror servers" + Advanced button) moves into a **collapsed disclosure** at the bottom: a single muted line `Servers: 2 upload · 3 mirror — Configure`. "Configure" opens the existing `openBlossomOnboarding()` dialog. All `uploadServers`/`mirrorServers` handler code is kept verbatim.
2. **File selected, transcode supported, job not started** (`file && uploadState === 'transcoding'` — note: today `uploadState` enters `'transcoding'` as soon as a file drops and analysis begins):
   - Render `BrowserTranscodeStep` in its settings state, **without** `hidePrimaryAction` — the step shows its own primary action (`Optimise & Upload` / `Generate HLS & Upload` / `Upload`). This deletes the footer-button proxy: remove `browserTranscodeRef`, `BrowserTranscodeStepHandle` usage, `onPrimaryActionChange`/`BrowserTranscodePrimaryActionState` wiring, and `hidePrimaryAction` prop usage from the orchestrator. (Keep the prop itself on `BrowserTranscodeStep` only if trivially; otherwise delete it and its conditional rendering — LSP-check references first.)
   - When the user clicks the primary action, `BrowserTranscodeStep` calls `onStartBackground` (→ `handleStartBrowserTranscodeUpload`). The orchestrator advances to `details` when `browserTranscodeState` becomes non-null (effect: `if (screen === 'source' && browserTranscodeState) setScreen('details')`). Same for the "Upload original only" path: it triggers `onSkip`/upload; advance when `uploadState === 'uploading' || videos.length > 0` for the original-only flow — concretely: advance on first transition into any of `browserTranscodeState != null`, `uploadState === 'uploading'`, or `uploadInfo.videos.length > 0` while `screen === 'source'` and a start action was taken. Implement as a single effect watching those three.
   - The existing internal settings/progress split inside `BrowserTranscodeStep` should follow `docs/browser-transcode-upload-ui-spec.md` (compact toolbar, estimate copy, Source/Original row). That spec's "Screen 2: Progress" now lives in the `ProcessingRail` on Details instead; `BrowserTranscodeStep` on Source only ever renders its settings state (when `backgroundState` exists we are no longer on Source).
3. **Job already running or done** (revisiting Source via Back): show a read-only summary — source filename/size from `browserTranscodeState.sourceName/sourceSize` or `originalVideoInfo`, a "Processing continues in the background — manage it on the Details screen" note, and the disabled dropzone. No restart affordance here (cancel lives on the rail).

Validation: "Continue" (footer next) from Source is enabled when `uploadInfo.videos.length > 0` (URL path / finished upload) — for the file path the screen advances automatically as described, so the footer Continue is hidden while `BrowserTranscodeStep` settings are visible (its own primary action is the continue).

## 5. Screen 2 — Details

Single scrollable column (max-w ~3xl) in this order:

1. **`ProcessingRail`** (sticky `top-0` card on desktop; see §10 mobile):
   - Active states (`browserTranscodeState.status ∈ queued|transcoding|uploading`, or `uploadState === 'uploading'` for URL/original-only): compact bar — status label, overall percent (reuse weighting logic from `TranscodeProgressScreen` in `BrowserTranscodeStep.tsx`: transcode and upload phases), ETA (`estimateRemainingSeconds` is already exported there — move both into the rail or a shared util `src/lib/transcode-progress.ts`), per-variant mini list (collapsible), Cancel button → `handleCancelBrowserTranscodeUpload` with confirm dialog during `uploading` phase (matches companion spec's cancel-safety rule).
   - `error` / `cancelled`: red/amber rail with `browserTranscodeState.error ?? message`, actions: **Retry** (re-run `handleStartBrowserTranscodeUpload` with the same variants — the original variants must be recoverable; if not directly available, Retry returns to Source settings state via `clearBrowserTranscodeUpload` + `setScreen('source')`) and **Change settings** (clear job state, back to Source). Implementer: check `getBrowserTranscodeUploadDraft`/job record for stored variants before deciding which Retry flavor is feasible; the fallback (back to Source with file retained) is acceptable.
   - `complete` (or `uploadState === 'finished'`): rail collapses into a success row ("3 files uploaded · HLS" style summary derived from `variants`/`uploadInfo.videos`) and expands `VideoFilesPanel` below it:
     - `VideoVariantsTable` (`videos`, `onRemove=handleRemoveVideo`, `deletingIndex`).
     - `DvmTranscodeAlert` when `uploadState === 'finished' && uploadInfo.videos[0] && !hasHlsVideo` — exact condition as today, props unchanged (`draftId`, `video`, `existingResolutions`, `onComplete=videoUploadState.handleAddTranscodedVideo`, `onStatusChange=setTranscodeStatus`).
     - Add-another-quality dropzone when `uploadState === 'finished' && !hasHlsVideo` (moves `useDropzone`+`onDropAdditional` here).
     - HLS preview button when an HLS variant exists (`HlsPreviewDialog` — currently triggered from inside `BrowserTranscodeStep`'s complete state; keep both or move trigger here, implementer's choice, but it must be reachable after completion).
2. **`FormFields`** — title/description/tags/language, unchanged. Title input gets `autoFocus`. Optionally prefill empty title from `originalVideoInfo.name` (strip extension) — do it in `useVideoUpload` when `originalVideoInfo` is first set and `title === ''`; mark with the existing `metadataDetected` toast pattern only if trivial, otherwise silent prefill.
3. **`ThumbnailSection`** — with auto-capture (§6). `videoUrl` prop computed as today: `file ? URL.createObjectURL(file) : videoUrl || videos[0]?.url || videos[0]?.uploadedBlobs[0]?.url`. (Pre-existing leak: `URL.createObjectURL(file)` is created per-render without revocation — fix by memoizing on `file` and revoking in cleanup while you're here.)
4. **Accordion** (shadcn `Accordion`, `type="multiple"`, all collapsed by default; a section with content shows a filled-state badge, e.g. "2 subtitles", "Scheduled", "1 person"):
   - **Subtitles** — `SubtitleSection` (props unchanged: `subtitles`, `onDrop=handleSubtitleDrop`, `onRemove`, `onLanguageChange`, `isUploading=subtitleUploading`).
   - **Schedule & visibility** — `PublishDateSection` (`publishAt`), `ContentWarning` (`contentWarningEnabled/Reason`), `ExpirationSection` (`expiration`).
   - **Attribution** — `PeoplePickerSection` (`people`), `OriginManager` (`origins`).
   - Auto-expand a section when its draft data is non-empty on mount (e.g. draft imported from VideoNotesPage has `people`/`publishAt`).

Footer Continue → `review`, enabled when `title.trim().length > 0` (thumbnail is NOT a gate here anymore — Review surfaces it; Publish still requires it).

## 6. Auto-thumbnail

Goal: a thumbnail exists by default without user action; user can replace it; publish never blocks on it unless capture failed AND user set nothing.

Mechanism:

1. Add to `useVideoUpload`: `handleAutoThumbnailCapture(blob: Blob)` — guards: only acts when `thumbnailSource === 'generated' && !thumbnailBlob && !thumbnail && thumbnailUploadInfo.uploadedBlobs.length === 0`. Sets `setThumbnailBlob(blob)` and computes blurhash (`generateBlurhash(new File([blob], 'thumbnail.webp', {type:'image/webp'}))` → `setThumbnailBlurhash`). **No upload now** — the dormant publish-time branch in `handleSubmit` (`thumbnailSource === 'generated' && thumbnailBlob` → upload during publish) handles it. Verify that branch also feeds `thumbnailUploadInfo`/imeta correctly (it constructs the File and uploads; read `useVideoUpload.ts` ~900–940 during implementation).
2. `ThumbnailSection` gets a new optional prop `onAutoCapture?: (blob: Blob) => void`. In `handleLoadedData` (first frame available), after `captureCurrentFrame`, also invoke `onAutoCapture(blob)` via the capture callback. Seek to a representative frame first: set `video.currentTime = Math.min(duration * 0.1, 10)` after `loadedmetadata`, capture on the following `seeked` — first frames are often black. Only fire auto-capture once per mount and only when the guard in (1) would pass (the hook guard is authoritative; the component can fire unconditionally).
3. Display: when `thumbnailBlob` is set, `ThumbnailSection`'s `hasThumbnail` branch already renders it (object URL) with a delete button — the user replaces it by deleting (returns to tabs) or via the slider + "Set thumbnail" (immediate upload path, unchanged) or file/URL upload (unchanged).
4. `handleDeleteThumbnail` already nulls `thumbnailBlob` — after deletion, do **not** re-auto-capture (the once-per-mount latch handles this).
5. CORS caveat: frame capture from remote `videoUrl` (URL-input drafts) can taint the canvas → `toBlob` throws/returns null. Wrap capture in try/catch; on failure simply skip auto-capture (manual paths still work). Blossom-hosted blobs generally send permissive CORS; do not engineer around tainted canvases beyond catching.
6. `canPublish` keeps requiring `hasThumbnailSet` — auto-capture normally satisfies it; if capture failed, the Review checklist row tells the user to set one (§7).

## 7. Screen 3 — Review & Publish

Layout: two-column on desktop (preview left, checklist+publish right), stacked on mobile.

1. **Preview card**: thumbnail image (object URL from `thumbnailBlob` or `thumbnailUploadInfo.uploadedBlobs[0].url`), title, duration (`originalVideoInfo.duration` formatted, or videos[0] metadata), description first lines, tag chips. Visual style: reuse/approximate `VideoCard` rendering — do NOT import `VideoCard` itself (it expects a Nostr event); build a small static preview.
2. **Readiness checklist** (each row: check / spinner / alert icon + label + jump link):
   - Video files: `uploadInfo.videos.length > 0` and neither browser job nor DVM active. While `browserTranscodeState.status ∈ queued|transcoding|uploading` or `isTranscoding` (DVM status `transcoding|mirroring`): spinner + percent, links back to Details rail.
   - Title: `title.trim().length > 0`, links to Details.
   - Thumbnail: `hasThumbnailSet`, links to Details.
   - Optional info rows (no gate): subtitles count, scheduled date if `publishAt`, content warning if enabled, expiration if not `none`.
3. **Relay selection**: keep `PublishButton` exactly as is (`writeRelays`, `selectedRelays=publishRelays`, `onSelectedRelaysChange=setPublishRelays`, `disabled=!canPublish`, `isPublishing`). It already embeds the relay dropdown; no separate picker needed.
4. **Raw event**: collapsible (`Collapsible` or accordion item) `EventPreview` fed by `previewEvent` (already produced by `useVideoUpload`).
5. `canPublish` formula unchanged: `videos > 0 && title && hasThumbnailSet && !isTranscoding` — PLUS extend `isTranscoding` to include the browser job: `const browserJobActive = browserTranscodeState && ['queued','transcoding','uploading'].includes(browserTranscodeState.status)`. (Today step-gating made this impossible to hit; in the parallel flow the user can reach Review mid-job, so the predicate must cover it.)
6. On publish success: existing wrapper behavior unchanged (delete draft, `removeByDraftId`, navigate to `buildVideoPath(generateEventLink(...))`).

### Navigation (shared footer)

- Footer left: Back (Source ← Details ← Review). Back is **always enabled** — revisiting Source shows the read-only summary (§4.3) while a job runs.
- Footer right: Delete-draft (trash) + Save Draft (only when `onBack` provided, as today — `handleBack` flushes all form state into the draft; update it to also persist nothing new — the screen is NOT persisted, see §8) + Continue (Source→Details→Review; hidden on Review where `PublishButton` is the terminal action and lives in the screen body, not the footer).
- Continue gating: Source — `uploadInfo.videos.length > 0` (and hidden while transcode settings are showing, §4.2); Details — `title.trim().length > 0`; Review — n/a.
- Keep Enter-key submit prevention: only the Review screen is wrapped in the `<form>`; Source/Details inputs cannot trigger publish.

## 8. Drafts, deep links, migration

- `UploadDraft` type: **no new fields.** Screen position is derived, not stored:
  ```ts
  function initialScreen(draft: UploadDraft, browserTranscodeState: BrowserTranscodeState | null): UploadScreen {
    const hasVideo = draft.uploadInfo.videos.length > 0
    const jobActive = !!browserTranscodeState
    if (!hasVideo && !jobActive && !draft.videoUrl) return 'source'
    return 'details'
  }
  ```
  Never resume into `review` automatically.
- Query param: support `?screen=source|details|review` (clamped by the same derivation — e.g. `screen=review` with no video falls back to derived screen). Legacy `?step=N` maps: 1–2 → `source`, 3–5 → `details`, 6 → `review`, then the same clamp applies. Keep legacy support because old notification/deep links may exist.
- Update `VideoNotesPage.handleImport` to navigate to `` `/upload?draft=${draft.id}&screen=details` `` (the draft has `videoUrl`; the existing auto-process effect in the orchestrator fires `handleUrlVideoProcessing` — keep that effect, it is input-method=url + videos empty + state initial guarded).
- The URL auto-process effect and `wrappedOnDrop`/`onPersist` ephemeral-draft persistence semantics are behavior-critical: persist BEFORE processing starts so background jobs always have a persisted draft.
- `useUploadDrafts`, `DraftPicker`, delete-with-media, Nostr sync: unchanged.

## 9. Deletions (must happen, not optional)

- `justArrivedAtStep5` state + 500 ms `setTimeout` + the submit guard referencing it.
- `currentStep !== 6` submit guard (replaced by form-only-on-Review).
- The duplicated step-1/step-2 block (extracted once into `VideoFilesPanel`).
- `browserTranscodeRef` / `BrowserTranscodeStepHandle` / `onPrimaryActionChange` / `BrowserTranscodePrimaryActionState` / `hidePrimaryAction` plumbing in `VideoUpload.tsx` (and in `BrowserTranscodeStep` if no other consumer — verify with `lsp references` before deleting the exported types; `index.ts` barrel exports them).
- Step-number `t('upload.stepN…')` headers; replace with per-screen titles (new i18n keys, see §11).
- The 1→2 auto-advance effect (subsumed by Source's internal states).

Run `npm run typecheck` after deletions; ESLint has custom rules in `eslint-rules/` — run `npm run test` (tsc + eslint + vitest + build) as the final gate.

## 10. Mobile

- Single column everywhere; accordions become the natural mobile hierarchy.
- `ProcessingRail` active state on mobile: sticky compact bar (h ~12) at top of Details with percent + status text + chevron to expand the variant list as a sheet/inline expansion.
- Footer: sticky bottom bar on mobile (`sticky bottom-0 bg-background border-t`), with safe-area padding; Continue is full-prominence, Back is icon-only (current pattern already hides labels with `hidden md:inline` — keep it).
- Review stacks preview above checklist; `PublishButton` full-width.
- Tap targets ≥ 36 px (companion spec rule).

## 11. i18n

Add to `src/i18n/locales/en.json` (other locales fall back via `defaultValue` in code — match existing convention of passing `defaultValue` at call sites):

- `upload.screen.source.title` "Upload video", `.description`
- `upload.screen.details.title` "Details", `.description` ("Add details while your video is processed")
- `upload.screen.review.title` "Review & publish", `.description`
- `upload.rail.*`: `queued`, `transcoding`, `uploading`, `complete`, `error`, `cancelled`, `cancelConfirmTitle`, `cancelConfirmBody`, `retry`, `changeSettings`, `filesUploaded` (plural), `eta`
- `upload.review.*`: `checklist.video`, `checklist.videoProcessing`, `checklist.title`, `checklist.thumbnail`, `checklist.subtitles`, `checklist.scheduled`, `checklist.contentWarning`, `checklist.expiration`, `rawEvent`
- `upload.details.sections.subtitles|schedule|attribution`
- `upload.source.servers` ("Servers: {{upload}} upload · {{mirror}} mirror"), `upload.source.configure`
- `upload.source.jobRunning` ("Processing continues in the background…")
- `upload.thumbnail.autoCaptured` (badge/hint "Auto-generated from video — replace if you like")
- Reuse existing keys wherever the string survives (`upload.addAnotherQuality`, `upload.uploading`, `upload.draft.*`, etc.). Do not rename existing keys.

## 12. Testing

Vitest + React Testing Library, colocated `*.test.tsx`. Mock at the hook boundary (`useVideoUpload` return value is a big object — build a `makeVideoUploadState(overrides)` fixture helper in `src/test/`), not at network level.

1. **Orchestrator screen selection** (`VideoUpload.test.tsx`):
   - empty draft → source; draft with videos → details; `?screen=review` with no video → clamped to source/details; legacy `?step=4` → details; `?step=2` + url draft → details (regression for the VideoNotesPage wart).
2. **Source**: settings shown when `file && uploadState==='transcoding'`; auto-advance to details when `browserTranscodeState` appears; read-only summary when returning mid-job; URL path advances on processed video.
3. **ProcessingRail**: fixture `BrowserTranscodeState`s for each status → correct label/percent/actions; cancel-confirm appears only in `uploading`; complete state renders `VideoFilesPanel` with `DvmTranscodeAlert` only when `!hasHlsVideo && uploadState==='finished'`.
4. **Auto-thumbnail**: `handleAutoThumbnailCapture` guard (no-op when any thumbnail exists), once-per-mount latch, capture failure → no thumbnail and Review checklist shows the alert row.
5. **Publish gating**: Publish disabled while `browserTranscodeState.status==='uploading'`; while DVM `transcodeStatus==='mirroring'`; without title; without thumbnail. Enabled when all satisfied.
6. **Deletion regressions**: no `justArrivedAtStep5` references (trivially by compile); Enter keypress in a Details input does not publish (render Details, fire Enter, assert `handleSubmit` not called).
7. Keep all existing passing tests green (`useUploadDrafts.test.tsx`, `useFileUpload.test.ts`, `upload-draft-utils.test.ts` etc. — they don't touch the wizard UI and must not change).

## 13. Implementation order (suggested phases)

1. **Extract without behavior change**: `VideoFilesPanel` (dedupes step 1/2 block), move `estimateRemainingSeconds`/overall-percent helpers to `src/lib/transcode-progress.ts`. Wizard still 6 steps. Tests for `VideoFilesPanel`.
2. **Screen skeleton**: `UploadScreen` state + `initialScreen` derivation + query-param mapping + `UploadSourceScreen`/`UploadDetailsScreen`/`UploadReviewScreen` containing the old step bodies (Details = old steps 3–6 stacked with accordions; Review = checklist + `PublishButton` + `EventPreview`). Delete step machine, gating per §7, delete §9 items. This is the big diff.
3. **Source flow**: `BrowserTranscodeStep` with own primary action, auto-advance effects, read-only revisit state, server disclosure.
4. **ProcessingRail**: live states, cancel/retry/change-settings, complete→`VideoFilesPanel`, extend `canPublish` with `browserJobActive`.
5. **Auto-thumbnail**: hook handler + `onAutoCapture` + seek-to-10% + latch + CORS catch.
6. **Mobile + polish**: sticky rail/footer, accordion badges, title prefill from filename.
7. **Cleanup gate**: i18n keys for all new strings, CHANGELOG entry, `npm run test` (runs tsc + eslint + vitest + build), update `docs/browser-transcode-upload-ui-spec.md` cross-reference (its "Screen 2: Progress" now = ProcessingRail; add a one-line note at its top pointing here).

Each phase must leave `npm run test` green. Phases 1 and 2 are sequential; 3–5 can be parallelized across agents after 2 lands (they touch disjoint components: Source screen / rail / thumbnail hook+section).

## 14. Risks & open edges

- **`uploadState === 'transcoding'` overload**: the value means "file analysis/transcode phase" and gates several renders. When restructuring, grep every `uploadState` comparison in the moved JSX and preserve semantics exactly; do not rename states.
- **Retry with same variants**: depends on what `browser-transcode-upload-manager` persists per job. If variants aren't recoverable, Retry = Change settings (documented fallback in §5).
- **DVM mid-flight on Review**: `DvmTranscodeAlert` lives on Details; its `onStatusChange` feeding `transcodeStatus` must keep firing while the user sits on Review — it only fires while mounted. Either keep `VideoFilesPanel` mounted (render Details hidden? no) or lift the DVM status: simplest is to render `VideoFilesPanel` ONLY on Details and accept that navigating to Review during a DVM job freezes status updates — NOT acceptable for publish gating. Resolution: `useUploadManager()` (UploadManagerProvider) already tracks DVM tasks globally; on Review, derive DVM activity from the manager's active tasks for this draft id (`ACTIVE_TASK_STATUSES`) instead of the alert callback. Implementer must verify the manager exposes per-draft task status (see `src/providers/upload/types.ts`); if it does, prefer it on BOTH screens and drop the `onStatusChange` plumbing; if not, keep `transcodeStatus` state but also gate publish on manager-level activity.
- **Object URL lifecycle**: Details and Review both create object URLs (`file`, `thumbnailBlob`); memoize + revoke on cleanup to avoid leaking large blobs across re-renders.
- **Ephemeral draft + background job**: starting a job MUST persist the draft first (`onPersist` before `onStartBackground`); current code does this in `wrappedOnDrop` — keep equivalent ordering for the settings-screen start action (check whether `handleStartBrowserTranscodeUpload` persists; if not, call `onPersist` in the orchestrator's `onStartBackground` wrapper).
