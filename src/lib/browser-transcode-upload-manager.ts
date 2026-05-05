import type { BlobDescriptor, Signer } from 'blossom-client-sdk'
import type {
  BrowserTranscodeState,
  BrowserTranscodeVariantState,
  UploadDraft,
} from '@/types/upload-draft'
import type { BrowserTranscodeVariant, TranscodeSourceMeta } from '@/lib/video-transcode'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { processUploadedVideo, type VideoVariant } from '@/lib/video-processing'
import { getItemsFromStorage, updateItemInStorage } from '@/lib/draft-persistence-storage'
import { runBrowserTranscodeJob } from '@/lib/browser-transcode-worker'

const STORAGE_KEY = 'nostube_upload_drafts'
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024
const DEFAULT_MAX_CONCURRENT_CHUNKS = 2

type BrowserTranscodeUploadListener = (draft: UploadDraft) => void

export interface BrowserTranscodeUploadJobOptions {
  draftId: string
  file: File
  variants: BrowserTranscodeVariant[]
  sourceMeta: TranscodeSourceMeta
  mode: 'replace' | 'append'
  keepOriginal: boolean
  initialServers: string[]
  mirrorServers: string[]
  signer: Signer
}

const listeners = new Set<BrowserTranscodeUploadListener>()
const activeJobs = new Map<string, AbortController>()

function getDraft(draftId: string): UploadDraft | undefined {
  return getItemsFromStorage<UploadDraft>(STORAGE_KEY).find(draft => draft.id === draftId)
}

function notify(draft: UploadDraft) {
  listeners.forEach(listener => listener(draft))
}

function updateDraft(draftId: string, updates: Partial<UploadDraft>): UploadDraft | undefined {
  const draft = updateItemInStorage<UploadDraft>(STORAGE_KEY, draftId, updates)
  if (draft) notify(draft)
  return draft
}

function getVariantStates(variants: BrowserTranscodeVariant[]): BrowserTranscodeVariantState[] {
  return variants.map(variant => ({
    label: variant.label,
    progress: 0,
    status: 'pending',
  }))
}

function updateBrowserState(
  draftId: string,
  updater: (state: BrowserTranscodeState) => BrowserTranscodeState
) {
  const draft = getDraft(draftId)
  const state = draft?.browserTranscodeState
  if (!draft || !state) return

  updateDraft(draftId, {
    browserTranscodeState: updater(state),
  })
}

async function uploadAndProcessFile(
  file: File,
  initialServers: string[],
  mirrorServers: string[],
  signer: Signer,
  onProgress: (progress: ChunkedUploadProgress) => void
): Promise<VideoVariant> {
  const uploadedBlobs = await uploadFileToMultipleServersChunked({
    file,
    servers: initialServers,
    signer,
    options: { chunkSize: DEFAULT_CHUNK_SIZE, maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS },
    callbacks: { onProgress },
  })

  let mirroredBlobs: BlobDescriptor[] = []
  if (mirrorServers.length > 0 && uploadedBlobs.length > 0) {
    const mirrorResults = await Promise.all(
      uploadedBlobs.map(blob => mirrorBlobsToServers({ mirrorServers, blob, signer }))
    )
    mirroredBlobs = mirrorResults.flat()
  }

  const video = await processUploadedVideo(file, uploadedBlobs)
  return { ...video, mirroredBlobs }
}

export function subscribeToBrowserTranscodeUploads(listener: BrowserTranscodeUploadListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getBrowserTranscodeUploadDraft(draftId: string): UploadDraft | undefined {
  return getDraft(draftId)
}

export function cancelBrowserTranscodeUpload(draftId: string) {
  activeJobs.get(draftId)?.abort()
  activeJobs.delete(draftId)
  updateBrowserState(draftId, state => ({
    ...state,
    status: 'cancelled',
    updatedAt: Date.now(),
    message: 'Browser transcode cancelled.',
  }))
}

export async function startBrowserTranscodeUploadJob(options: BrowserTranscodeUploadJobOptions) {
  const {
    draftId,
    file,
    variants,
    sourceMeta,
    mode,
    keepOriginal,
    initialServers,
    mirrorServers,
    signer,
  } = options

  if (activeJobs.has(draftId)) {
    throw new Error('A browser transcode job is already running for this draft.')
  }

  const controller = new AbortController()
  activeJobs.set(draftId, controller)

  updateDraft(draftId, {
    browserTranscodeState: {
      status: 'queued',
      mode,
      keepOriginal,
      sourceName: file.name,
      sourceSize: file.size,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      variants: getVariantStates(variants),
      message: 'Browser transcode queued.',
    },
  })

  try {
    updateBrowserState(draftId, state => ({
      ...state,
      status: 'transcoding',
      updatedAt: Date.now(),
      message: 'Transcoding video in background...',
    }))

    const transcodedFiles =
      variants.length > 0
        ? await runBrowserTranscodeJob(
            file,
            variants,
            sourceMeta,
            ({ variantIndex, progress }) => {
              updateBrowserState(draftId, state => ({
                ...state,
                status: 'transcoding',
                updatedAt: Date.now(),
                variants: state.variants.map((variant, index) => {
                  if (index < variantIndex) return { ...variant, progress: 1, status: 'done' }
                  if (index === variantIndex) return { ...variant, progress, status: 'active' }
                  return variant
                }),
              }))
            },
            (variantIndex, message) => {
              updateBrowserState(draftId, state => ({
                ...state,
                updatedAt: Date.now(),
                variants: state.variants.map((variant, index) =>
                  index === variantIndex ? { ...variant, status: 'error' } : variant
                ),
                message,
              }))
            },
            controller.signal
          )
        : []

    updateBrowserState(draftId, state => ({
      ...state,
      status: 'uploading',
      updatedAt: Date.now(),
      variants: state.variants.map(variant =>
        variant.status === 'active' || variant.status === 'pending'
          ? { ...variant, progress: 1, status: 'done' }
          : variant
      ),
      message: 'Uploading transcoded videos...',
    }))

    const filesToUpload = keepOriginal ? [...transcodedFiles, file] : transcodedFiles
    const uploadedVideos: VideoVariant[] = []
    for (const fileToUpload of filesToUpload) {
      const video = await uploadAndProcessFile(
        fileToUpload,
        initialServers,
        mirrorServers,
        signer,
        progress => {
          updateBrowserState(draftId, state => ({
            ...state,
            status: 'uploading',
            updatedAt: Date.now(),
            uploadProgress: progress,
          }))
        }
      )
      uploadedVideos.push(video)
    }

    const draft = getDraft(draftId)
    const currentVideos = draft?.uploadInfo.videos ?? []
    const videos = mode === 'append' ? [...currentVideos, ...uploadedVideos] : uploadedVideos

    updateDraft(draftId, {
      uploadInfo: { videos },
      browserTranscodeState: {
        status: 'complete',
        mode,
        keepOriginal,
        sourceName: file.name,
        sourceSize: file.size,
        startedAt: draft?.browserTranscodeState?.startedAt ?? Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
        variants: getVariantStates(variants).map(variant => ({
          ...variant,
          progress: 1,
          status: 'done',
        })),
        message: 'Browser transcode and upload complete.',
      },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      updateBrowserState(draftId, state => ({
        ...state,
        status: 'cancelled',
        updatedAt: Date.now(),
        message: 'Browser transcode cancelled.',
      }))
      return
    }

    updateBrowserState(draftId, state => ({
      ...state,
      status: 'error',
      updatedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    }))
  } finally {
    activeJobs.delete(draftId)
  }
}
