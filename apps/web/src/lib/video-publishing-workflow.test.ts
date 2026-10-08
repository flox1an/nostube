import { describe, expect, it, vi } from 'vitest'
import {
  reduceWorkflowState,
  runVideoPublishingWorkflow,
  workflowStateFromUploadTask,
  type PublishedVideo,
  type WorkflowState,
} from './video-publishing-workflow'

const publishedVideo: PublishedVideo = {
  id: 'event-id',
  kind: 34235,
  pubkey: 'pubkey',
  identifier: 'draft-id',
}

describe('VideoPublishingWorkflow', () => {
  it('runs the upload pipeline as one ordered state machine', async () => {
    const calls: string[] = []
    const states: WorkflowState<PublishedVideo>[] = []

    const state = await runVideoPublishingWorkflow({
      onStateChange: nextState => states.push(nextState),
      steps: {
        validate: () => {
          calls.push('validate')
        },
        upload: ({ reportProgress }) => {
          calls.push('upload')
          reportProgress(50)
        },
        transcode: () => {
          calls.push('transcode')
        },
        mirror: () => {
          calls.push('mirror')
        },
        publish: () => {
          calls.push('publish')
          return publishedVideo
        },
      },
    })

    expect(calls).toEqual(['validate', 'upload', 'transcode', 'mirror', 'publish'])
    expect(states.map(s => s.phase)).toContain('validating')
    expect(states.map(s => s.phase)).toContain('uploading')
    expect(states.map(s => s.phase)).toContain('transcoding')
    expect(states.map(s => s.phase)).toContain('mirroring')
    expect(states.map(s => s.phase)).toContain('publishing')
    expect(state).toEqual({
      phase: 'done',
      progress: 100,
      result: publishedVideo,
    })
  })

  it('skips absent optional phases without breaking progress', async () => {
    const states: WorkflowState<PublishedVideo>[] = []

    const state = await runVideoPublishingWorkflow({
      onStateChange: nextState => states.push(nextState),
      steps: {
        validate: vi.fn(),
        upload: vi.fn(),
        publish: vi.fn(() => publishedVideo),
      },
    })

    const phaseChanges = states
      .map(s => s.phase)
      .filter((phase, index, phases) => phase !== phases[index - 1])

    expect(phaseChanges).toEqual(['validating', 'uploading', 'publishing', 'done'])
    expect(state.progress).toBe(100)
    expect(state.result).toBe(publishedVideo)
  })

  it('returns a failed state when a pipeline step throws', async () => {
    const state = await runVideoPublishingWorkflow({
      steps: {
        validate: () => {
          throw new Error('No valid thumbnail available')
        },
        upload: vi.fn(),
        publish: vi.fn(() => publishedVideo),
      },
    })

    expect(state.phase).toBe('failed')
    expect(state.error?.message).toBe('No valid thumbnail available')
  })

  it('keeps reducer transitions deterministic', () => {
    const initial: WorkflowState = { phase: 'validating', progress: 0 }
    const uploading = reduceWorkflowState(initial, {
      type: 'phase-start',
      phase: 'uploading',
      progress: 25,
    })
    const failed = reduceWorkflowState(uploading, {
      type: 'failed',
      error: new Error('publish failed'),
    })

    expect(uploading).toEqual({ phase: 'uploading', progress: 25 })
    expect(failed.phase).toBe('failed')
    expect(failed.progress).toBe(25)
    expect(failed.error?.message).toBe('publish failed')
  })

  it('maps upload manager tasks into the workflow contract', () => {
    expect(
      workflowStateFromUploadTask({
        id: 'task-id',
        draftId: 'draft-id',
        status: 'transcoding',
        createdAt: 1,
        updatedAt: 2,
        transcodeState: {
          status: 'transcoding',
          phase: 'mirroring',
          percentage: 72,
          resolutionQueue: [],
          completedResolutions: [],
          statusMessages: [],
        },
      })
    ).toEqual({ phase: 'mirroring', progress: 72 })

    const failed = workflowStateFromUploadTask({
      id: 'task-id',
      draftId: 'draft-id',
      status: 'error',
      createdAt: 1,
      updatedAt: 2,
      error: {
        message: 'DVM timed out',
        retryable: true,
      },
    })

    expect(failed.phase).toBe('failed')
    expect(failed.error?.message).toBe('DVM timed out')
  })
})
