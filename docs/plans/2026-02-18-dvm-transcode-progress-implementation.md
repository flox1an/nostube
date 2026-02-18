# DVM Transcode Progress Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-progress-bar transcode UI with a 3-phase (Re-encoding, Uploading, Copying) progress display per resolution variant.

**Architecture:** Add a `phase` field to `TranscodeState` derived from DVM message text ("Transcoding..." vs "Uploading...") in `UploadManagerProvider`. Surface it through `useDvmTranscodeManager` into `TranscodeProgress`. Replace the transcoding/mirroring sections of `DvmTranscodeAlert` with per-variant rows, each showing a 3-step phase indicator with a progress bar under the active step.

**Tech Stack:** React, TypeScript, TailwindCSS, shadcn/ui Progress, lucide-react icons

---

### Task 1: Add `phase` to TranscodeState type

**Files:**

- Modify: `src/types/upload-manager.ts:26-50`

**Step 1: Add phase field to TranscodeState**

In `src/types/upload-manager.ts`, add `phase` to `TranscodeState`:

```ts
export type TranscodePhase = 'transcoding' | 'uploading' | 'mirroring'

export interface TranscodeState {
  status: 'discovering' | 'bidding' | 'transcoding' | 'mirroring'
  phase?: TranscodePhase // <-- ADD THIS
  requestEventId?: string
  // ... rest unchanged
}
```

**Step 2: Build and verify no type errors**

Run: `npm run typecheck`
Expected: PASS (phase is optional, nothing reads it yet)

**Step 3: Commit**

```bash
git add src/types/upload-manager.ts
git commit -m "feat: add phase field to TranscodeState type"
```

---

### Task 2: Detect phase from DVM messages in UploadManagerProvider

**Files:**

- Modify: `src/providers/upload/UploadManagerProvider.tsx:767-781` (feedback handler)
- Modify: `src/providers/upload/UploadManagerProvider.tsx:1027-1035` (mirroring state update)

**Step 1: Add phase detection helper**

At the top of `UploadManagerProvider.tsx` (after imports, near `hasEncryptedTag`), add:

```ts
import type { TranscodePhase } from '@/types/upload-manager'

/**
 * Detect the current transcode phase from a DVM feedback message.
 * DVM sends "Transcoding..." during re-encoding and "Uploading..." when uploading results.
 */
function detectPhaseFromMessage(message?: string): TranscodePhase {
  if (message && /^uploading/i.test(message)) return 'uploading'
  return 'transcoding'
}
```

**Step 2: Set phase in the feedback handler**

In the `subscribeToDvmResponses` callback (~line 771-781), where we update state on `processing`/`partial` feedback, add the `phase` field:

Change:

```ts
if (feedbackStatus === 'processing' || feedbackStatus === 'partial') {
  // Update task state
  updateTasksState(taskId, {
    transcodeState: {
      ...tasks.get(taskId)?.transcodeState,
      status: 'transcoding',
      message: message || 'Processing...',
      percentage,
      eta,
    } as TranscodeState,
  })
}
```

To:

```ts
if (feedbackStatus === 'processing' || feedbackStatus === 'partial') {
  const phase = detectPhaseFromMessage(message)
  // Update task state
  updateTasksState(taskId, {
    transcodeState: {
      ...tasks.get(taskId)?.transcodeState,
      status: 'transcoding',
      phase,
      message: message || 'Processing...',
      percentage,
      eta,
    } as TranscodeState,
  })
}
```

**Step 3: Set phase to 'mirroring' when mirroring starts**

In `processResolution` (~line 1027-1035), the mirroring state update already sets `status: 'mirroring'`. Add `phase: 'mirroring'`:

Change:

```ts
updateTasksState(taskId, {
  status: 'mirroring',
  transcodeState: {
    ...tasks.get(taskId)?.transcodeState,
    status: 'mirroring',
    message: `Copying ${resolution} to your servers...`,
  } as TranscodeState,
})
```

To:

```ts
updateTasksState(taskId, {
  status: 'mirroring',
  transcodeState: {
    ...tasks.get(taskId)?.transcodeState,
    status: 'mirroring',
    phase: 'mirroring',
    message: `Copying ${resolution} to your servers...`,
    percentage: undefined,
    eta: undefined,
  } as TranscodeState,
})
```

**Step 4: Build and verify**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/upload/UploadManagerProvider.tsx
git commit -m "feat: detect transcode phase from DVM feedback messages"
```

---

### Task 3: Surface phase in TranscodeProgress via useDvmTranscodeManager

**Files:**

- Modify: `src/hooks/useDvmTranscodeManager.ts:29-40` (TranscodeProgress interface)
- Modify: `src/hooks/useDvmTranscodeManager.ts:101-127` (mapTaskToProgress)

**Step 1: Add phase to TranscodeProgress interface**

```ts
export interface TranscodeProgress {
  status: TranscodeStatus
  message: string
  eta?: number
  percentage?: number
  phase?: 'transcoding' | 'uploading' | 'mirroring' // <-- ADD
  statusMessages: StatusMessage[]
  queue?: {
    resolutions: string[]
    currentIndex: number
    completed: string[]
  }
}
```

**Step 2: Map phase in mapTaskToProgress**

In `mapTaskToProgress`, add `phase` to the return object:

```ts
return {
  status: mapTaskStatusToTranscodeStatus(task),
  message: state.message || '',
  eta: state.eta,
  percentage: state.percentage,
  phase: state.phase, // <-- ADD
  statusMessages: [],
  queue: {
    resolutions: state.resolutionQueue || [],
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    completed: state.completedResolutions || [],
  },
}
```

**Step 3: Build and verify**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/hooks/useDvmTranscodeManager.ts
git commit -m "feat: surface transcode phase in TranscodeProgress"
```

---

### Task 4: Add i18n keys for the 3-phase progress

**Files:**

- Modify: `src/i18n/locales/en.json` (under `upload.transcode`)
- Modify: `src/i18n/locales/de.json`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add new keys to en.json**

Add inside the `upload.transcode` object:

```json
"phaseReencoding": "Re-encoding",
"phaseUploading": "Uploading",
"phaseCopying": "Copying",
"waiting": "Waiting"
```

**Step 2: Add translations to de.json, fr.json, es.json**

DE:

```json
"phaseReencoding": "Umkodierung",
"phaseUploading": "Hochladen",
"phaseCopying": "Kopieren",
"waiting": "Wartend"
```

FR:

```json
"phaseReencoding": "Reencodage",
"phaseUploading": "Envoi",
"phaseCopying": "Copie",
"waiting": "En attente"
```

ES:

```json
"phaseReencoding": "Recodificando",
"phaseUploading": "Subiendo",
"phaseCopying": "Copiando",
"waiting": "Esperando"
```

**Step 3: Commit**

```bash
git add src/i18n/locales/*.json
git commit -m "feat: add i18n keys for transcode phase labels"
```

---

### Task 5: Build TranscodeVariantProgress component and rewrite DvmTranscodeAlert

**Files:**

- Modify: `src/components/video-upload/DvmTranscodeAlert.tsx:276-359` (replace transcoding + mirroring sections)

This is the main UI change. Replace the separate `transcoding` and `mirroring` status blocks (lines 276-359) with a unified view that renders one `TranscodeVariantProgress` row per resolution.

**Step 1: Create TranscodeVariantProgress as a local component inside DvmTranscodeAlert.tsx**

Add after the `QueueStatus` component (before `StatusLog`). This replaces both `QueueStatus` and the transcoding/mirroring Alert bodies:

```tsx
type PhaseStep = 'transcoding' | 'uploading' | 'mirroring'

const PHASE_ORDER: PhaseStep[] = ['transcoding', 'uploading', 'mirroring']

function getPhaseIndex(phase?: PhaseStep): number {
  if (!phase) return 0
  return PHASE_ORDER.indexOf(phase)
}

interface VariantProgressProps {
  resolution: string
  isActive: boolean
  isCompleted: boolean
  isWaiting: boolean
  phase?: PhaseStep
  percentage?: number
  eta?: number
}

function TranscodeVariantProgress({
  resolution,
  isActive,
  isCompleted,
  isWaiting,
  phase,
  percentage,
  eta,
}: VariantProgressProps) {
  const { t } = useTranslation()

  const phaseLabels = [
    t('upload.transcode.phaseReencoding', { defaultValue: 'Re-encoding' }),
    t('upload.transcode.phaseUploading', { defaultValue: 'Uploading' }),
    t('upload.transcode.phaseCopying', { defaultValue: 'Copying' }),
  ]

  const activePhaseIndex = isActive ? getPhaseIndex(phase) : -1

  return (
    <div className="py-2">
      {/* Resolution label */}
      <div className="text-sm font-medium mb-1.5">{resolution}</div>

      {/* Phase steps */}
      <div className="flex items-center gap-1 mb-1.5">
        {PHASE_ORDER.map((step, index) => {
          const isStepComplete = isCompleted || (isActive && activePhaseIndex > index)
          const isStepActive = isActive && activePhaseIndex === index
          const isStepWaiting = isWaiting || (isActive && activePhaseIndex < index)

          return (
            <div key={step} className="flex items-center gap-1">
              {index > 0 && (
                <div
                  className={`h-px w-4 ${isStepComplete ? 'bg-green-500 dark:bg-green-400' : 'bg-muted-foreground/30'}`}
                />
              )}
              <div className="flex items-center gap-1">
                {isStepComplete && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0" />
                )}
                {isStepActive && (
                  <Loader2 className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 animate-spin shrink-0" />
                )}
                {isStepWaiting && (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <span
                  className={`text-xs ${
                    isStepComplete
                      ? 'text-green-600 dark:text-green-400'
                      : isStepActive
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-muted-foreground/50'
                  }`}
                >
                  {phaseLabels[index]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar for active variant */}
      {isActive && percentage !== undefined && (
        <div className="space-y-0.5">
          <Progress value={percentage} className="h-1.5" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{percentage}%</span>
            {eta !== undefined && <span>{formatEta(eta)}</span>}
          </div>
        </div>
      )}

      {/* Waiting label */}
      {isWaiting && (
        <p className="text-xs text-muted-foreground/50">
          {t('upload.transcode.waiting', { defaultValue: 'Waiting' })}
        </p>
      )}
    </div>
  )
}
```

**Step 2: Replace the transcoding and mirroring blocks in DvmTranscodeAlert**

Replace the two blocks (status === 'transcoding' block at lines 277-331 and status === 'mirroring' block at lines 334-359) with a single unified block:

```tsx
// Active transcoding/mirroring state - show per-variant progress
if (status === 'transcoding' || status === 'mirroring') {
  const queue = progress.queue
  const resolutions = queue?.resolutions || []
  const currentIndex = queue?.currentIndex ?? 0
  const completed = queue?.completed || []

  return (
    <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
      <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
      <AlertTitle className="text-blue-800 dark:text-blue-200">
        {t('upload.transcode.transcoding', { defaultValue: 'Transcoding video...' })}
      </AlertTitle>
      <AlertDescription className="text-blue-700 dark:text-blue-300">
        <div className="divide-y divide-blue-200/50 dark:divide-blue-800/50">
          {resolutions.map((resolution, index) => {
            const isCompleted = completed.includes(resolution)
            const isCurrent = index === currentIndex && !isCompleted
            const isWaiting = index > currentIndex && !isCompleted

            return (
              <TranscodeVariantProgress
                key={resolution}
                resolution={resolution}
                isActive={isCurrent}
                isCompleted={isCompleted}
                isWaiting={isWaiting}
                phase={isCurrent ? progress.phase : undefined}
                percentage={isCurrent ? progress.percentage : undefined}
                eta={isCurrent ? progress.eta : undefined}
              />
            )
          })}
        </div>
        <StatusLog messages={progress.statusMessages} />
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={cancel} className="cursor-pointer">
            <X className="h-4 w-4 mr-2" />
            {t('upload.transcode.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
```

**Step 3: Remove the old QueueStatus component**

Delete the `QueueStatus` component (lines 452-485) - it's replaced by the per-variant rows. Also remove its usage in discovering/bidding/resuming states (replace with nothing, or keep the simple message).

In the discovering/bidding block (~line 251), remove `{progress.queue && <QueueStatus queue={progress.queue} />}`.

In the resuming block (~line 269), remove `{progress.queue && <QueueStatus queue={progress.queue} />}`.

**Step 4: Build and verify**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS (no ESLint errors from unused imports etc.)

**Step 5: Format**

Run: `npm run format`

**Step 6: Commit**

```bash
git add src/components/video-upload/DvmTranscodeAlert.tsx
git commit -m "feat: 3-phase per-variant transcode progress UI"
```

---

### Task 6: Update CHANGELOG and final verification

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Add CHANGELOG entry**

Under `## [Unreleased]` → `### Changed`:

```markdown
- DVM transcoding: redesigned progress display with 3 distinct phases per resolution variant (Re-encoding, Uploading, Copying to your servers); each variant shows its own phase indicator with connected step circles (checkmark/spinner/circle) and progress bar under the active step; replaces the single progress bar + queue status with a clearer per-variant view; phase detection parses DVM kind 7000 message text ("Transcoding..." vs "Uploading..."); i18n support in EN/DE/FR/ES for phase labels
```

**Step 2: Run full build**

Run: `npm run build`
Expected: PASS

**Step 3: Format**

Run: `npm run format`

**Step 4: Commit all**

```bash
git add CHANGELOG.md
git commit -m "chore: update CHANGELOG for transcode progress redesign"
```
