import type { UploadTask } from '@/types/upload-manager'

export type WorkflowPhase =
  'validating' | 'uploading' | 'transcoding' | 'mirroring' | 'publishing' | 'done' | 'failed'

export interface PublishedVideo {
  id: string
  kind: number
  pubkey: string
  identifier: string
}

export interface WorkflowState<Result = PublishedVideo> {
  phase: WorkflowPhase
  progress: number
  result?: Result
  error?: Error
}

export type WorkflowStateListener<Result> = (state: WorkflowState<Result>) => void

export type WorkflowStepContext<Result> = {
  state: WorkflowState<Result>
  reportProgress(progress: number): void
}

export type WorkflowStep<Result> = (context: WorkflowStepContext<Result>) => Promise<void> | void
export type WorkflowPublishStep<Result> = (
  context: WorkflowStepContext<Result>
) => Promise<Result> | Result

export interface VideoPublishingWorkflowSteps<Result = PublishedVideo> {
  validate: WorkflowStep<Result>
  upload: WorkflowStep<Result>
  transcode?: WorkflowStep<Result>
  mirror?: WorkflowStep<Result>
  publish: WorkflowPublishStep<Result>
}

export interface VideoPublishingWorkflowOptions<Result = PublishedVideo> {
  steps: VideoPublishingWorkflowSteps<Result>
  onStateChange?: WorkflowStateListener<Result>
}

type WorkflowStepName = keyof VideoPublishingWorkflowSteps<unknown>

type WorkflowEvent<Result> =
  | { type: 'phase-start'; phase: WorkflowPhase; progress: number }
  | { type: 'phase-progress'; progress: number }
  | { type: 'done'; result: Result }
  | { type: 'failed'; error: Error }

const PHASE_ORDER: WorkflowStepName[] = ['validate', 'upload', 'transcode', 'mirror', 'publish']

const STEP_PHASES: Record<WorkflowStepName, WorkflowPhase> = {
  validate: 'validating',
  upload: 'uploading',
  transcode: 'transcoding',
  mirror: 'mirroring',
  publish: 'publishing',
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function clampProgress(progress: number): number {
  if (Number.isNaN(progress)) return 0
  return Math.max(0, Math.min(100, Math.round(progress)))
}

export function reduceWorkflowState<Result>(
  state: WorkflowState<Result>,
  event: WorkflowEvent<Result>
): WorkflowState<Result> {
  switch (event.type) {
    case 'phase-start':
      return {
        phase: event.phase,
        progress: clampProgress(event.progress),
      }
    case 'phase-progress':
      return {
        ...state,
        progress: clampProgress(event.progress),
      }
    case 'done':
      return {
        phase: 'done',
        progress: 100,
        result: event.result,
      }
    case 'failed':
      return {
        phase: 'failed',
        progress: state.progress,
        error: event.error,
      }
  }
}

export function workflowStateFromUploadTask<Result = PublishedVideo>(
  task: UploadTask
): WorkflowState<Result> {
  if (task.status === 'complete') {
    return { phase: 'done', progress: 100 }
  }

  if (task.status === 'error' || task.status === 'cancelled') {
    return {
      phase: 'failed',
      progress:
        task.transcodeState?.percentage ??
        task.uploadProgress?.percentage ??
        (task.status === 'cancelled' ? 0 : 100),
      error: new Error(
        task.error?.message ?? (task.status === 'cancelled' ? 'Upload cancelled' : 'Upload failed')
      ),
    }
  }

  if (task.status === 'uploading') {
    return {
      phase: 'uploading',
      progress: clampProgress(task.uploadProgress?.percentage ?? 0),
    }
  }

  if (task.status === 'mirroring') {
    return {
      phase: 'mirroring',
      progress: clampProgress(task.uploadProgress?.percentage ?? 0),
    }
  }

  if (task.status === 'transcoding' && task.transcodeState) {
    const transcodePhase = task.transcodeState.phase
    return {
      phase:
        transcodePhase === 'mirroring'
          ? 'mirroring'
          : transcodePhase === 'uploading'
            ? 'uploading'
            : 'transcoding',
      progress: clampProgress(task.transcodeState.percentage ?? 0),
    }
  }

  return { phase: 'validating', progress: 0 }
}

export async function runVideoPublishingWorkflow<Result = PublishedVideo>({
  steps,
  onStateChange,
}: VideoPublishingWorkflowOptions<Result>): Promise<WorkflowState<Result>> {
  let state: WorkflowState<Result> = { phase: 'validating', progress: 0 }

  const enabledSteps = PHASE_ORDER.filter(stepName => steps[stepName])
  const stepWeight = enabledSteps.length > 0 ? 100 / enabledSteps.length : 100

  const emit = (event: WorkflowEvent<Result>) => {
    state = reduceWorkflowState(state, event)
    onStateChange?.(state)
  }

  try {
    let result: Result | undefined

    for (const [index, stepName] of enabledSteps.entries()) {
      const phase = STEP_PHASES[stepName]
      const phaseStart = index * stepWeight
      const phaseEnd = (index + 1) * stepWeight
      const step = steps[stepName]

      emit({ type: 'phase-start', phase, progress: phaseStart })

      const context: WorkflowStepContext<Result> = {
        state,
        reportProgress: progress => {
          const phaseProgress = phaseStart + (phaseEnd - phaseStart) * (progress / 100)
          emit({ type: 'phase-progress', progress: phaseProgress })
        },
      }

      if (stepName === 'publish') {
        result = await (step as WorkflowPublishStep<Result>)(context)
      } else {
        await (step as WorkflowStep<Result>)(context)
      }

      emit({ type: 'phase-progress', progress: phaseEnd })
    }

    if (!result) {
      throw new Error('Video publishing workflow completed without a publish result')
    }

    emit({ type: 'done', result })
    return state
  } catch (error) {
    emit({ type: 'failed', error: toError(error) })
    return state
  }
}
