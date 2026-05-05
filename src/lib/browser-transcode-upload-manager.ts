import type { BlobDescriptor, Signer } from 'blossom-client-sdk'
import type {
  BrowserTranscodeState,
  BrowserTranscodeVariantState,
  UploadDraft,
} from '@/types/upload-draft'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { processUploadedVideo, type VideoVariant } from '@/lib/video-processing'
import { getItemsFromStorage, updateItemInStorage } from '@/lib/draft-persistence-storage'
import { runBrowserTranscodeJob } from '@/lib/browser-transcode-worker'
import {
  rewriteHlsPlaylists,
  transcodeToHls,
  type BrowserTranscodeVariant,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'

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

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 * Ensures the last call always goes through.
 */
function throttle<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let lastTime = 0
  let timeout: ReturnType<typeof setTimeout> | null = null
  let lastArgs: any[] | null = null

  return ((...args: any[]) => {
    const now = Date.now()
    const remaining = wait - (now - lastTime)

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      lastTime = now
      func(...args)
    } else {
      lastArgs = args
      if (!timeout) {
        timeout = setTimeout(() => {
          lastTime = Date.now()
          timeout = null
          if (lastArgs) {
            func(...lastArgs)
            lastArgs = null
          }
        }, remaining)
      }
    }
  }) as T
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

async function uploadAndGetUrl(
  file: File,
  initialServers: string[],
  signer: Signer,
  onProgress?: (progress: ChunkedUploadProgress) => void
): Promise<string> {
  const uploadedBlobs = await uploadFileToMultipleServersChunked({
    file,
    servers: initialServers,
    signer,
    options: { chunkSize: DEFAULT_CHUNK_SIZE, maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS },
    callbacks: { onProgress },
  })

  if (uploadedBlobs.length === 0) throw new Error(`Failed to upload ${file.name}`)
  return uploadedBlobs[0].url
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

    const isHls = variants.some(v => v.format === 'hls')
    console.log('[BrowserTranscodeUploadManager] Starting job:', { isHls, variants, keepOriginal })

    let lastProgressTime = 0
    const throttledUpdateProgress = throttle((progress: number) => {
      updateBrowserState(draftId, state => ({
        ...state,
        status: 'transcoding',
        updatedAt: Date.now(),
        variants: state.variants.map(v => ({
          ...v,
          progress,
          status: 'active',
        })),
      }))
    }, 500)

    const transcodedFiles =
      variants.length > 0
        ? isHls
          ? await (async () => {
              console.log('[BrowserTranscodeUploadManager] Calling transcodeToHls')
              const result = await transcodeToHls(
                file,
                variants,
                sourceMeta,
                (_, progress) => {
                  console.log(
                    `[BrowserTranscodeUploadManager] HLS Progress: ${Math.round(progress * 100)}%`
                  )
                  throttledUpdateProgress(progress)
                },
                controller.signal
              )
              console.log(
                `[BrowserTranscodeUploadManager] HLS Transcode complete, produced ${result.size} files`
              )
              return result
            })()
          : await runBrowserTranscodeJob(
              file,
              variants,
              sourceMeta,
              ({ variantIndex, progress }) => {
                const now = Date.now()
                if (now - lastProgressTime > 500 || progress === 1) {
                  lastProgressTime = now
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
                }
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

    console.log('[BrowserTranscodeUploadManager] Transcode result type:', transcodedFiles instanceof Map ? 'Map' : 'Array')

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

    const uploadedVideos: VideoVariant[] = []

    if (isHls && transcodedFiles instanceof Map) {
      // HLS Stage 1: Upload segments and init files
      const uploadedUrls = new Map<string, string>()
      const segmentPaths = Array.from(transcodedFiles.keys()).filter(p => !p.endsWith('.m3u8'))

      for (let i = 0; i < segmentPaths.length; i++) {
        const path = segmentPaths[i]
        const hlsFile = transcodedFiles.get(path)!
        const url = await uploadAndGetUrl(hlsFile, initialServers, signer)
        uploadedUrls.set(path, url)

        updateBrowserState(draftId, state => ({
          ...state,
          updatedAt: Date.now(),
          message: `Uploading HLS segments (${i + 1}/${segmentPaths.length})...`,
          uploadProgress: {
            uploadedBytes: i + 1,
            totalBytes: segmentPaths.length,
            percentage: (i + 1) / segmentPaths.length,
            currentChunk: i + 1,
            totalChunks: segmentPaths.length,
          },
        }))
      }

      // HLS Stage 2: Rewrite playlists and upload them
      const rewrittenFiles = await rewriteHlsPlaylists(transcodedFiles, uploadedUrls)
      const playlistPaths = Array.from(rewrittenFiles.keys()).filter(
        p => p.endsWith('.m3u8') && p !== 'master.m3u8'
      )

      for (const path of playlistPaths) {
        const playlistFile = rewrittenFiles.get(path)!
        const url = await uploadAndGetUrl(playlistFile, initialServers, signer)
        uploadedUrls.set(path, url)
      }

      // HLS Stage 3: Rewrite and upload master playlist
      const masterFile = rewrittenFiles.get('master.m3u8')!
      const finalRewritten = await rewriteHlsPlaylists(
        new Map([['master.m3u8', masterFile]]),
        uploadedUrls
      )
      const masterUrl = await uploadAndGetUrl(
        finalRewritten.get('master.m3u8')!,
        initialServers,
        signer
      )

      // Add HLS variant
      uploadedVideos.push({
        url: masterUrl,
        mimeType: 'application/vnd.apple.mpegurl',
        dimension: `${sourceMeta.width}x${sourceMeta.height}`,
        qualityLabel: variants[0].targetHeight + 'p',
        duration: sourceMeta.duration,
        uploadedBlobs: [], // Master playlist is uploaded once, but we don't have its descriptor easily here
        mirroredBlobs: [],
        inputMethod: 'file',
      })
    } else if (transcodedFiles instanceof Array) {
      const filesToUpload = keepOriginal ? [...transcodedFiles, file] : transcodedFiles
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
    console.error('[BrowserTranscodeUploadManager] Job failed:', error)
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
