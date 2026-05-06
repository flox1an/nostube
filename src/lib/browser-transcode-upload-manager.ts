import type { BlobDescriptor, Signer } from 'blossom-client-sdk'
import type { BrowserTranscodeState, BrowserTranscodeVariantState } from '@/types/upload-draft'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import { processUploadedVideo, type VideoVariant } from '@/lib/video-processing'
import { getItemsFromStorage } from '@/lib/draft-persistence-storage'
import { runBrowserTranscodeJob } from '@/lib/browser-transcode-worker'
import {
  rewriteHlsPlaylists,
  type BrowserTranscodeVariant,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'
import {
  getBrowserTranscodeJob,
  removeBrowserTranscodeJob,
  subscribeToBrowserTranscodeJobs,
  updateBrowserTranscodeJob,
  upsertBrowserTranscodeJob,
} from '@/lib/browser-transcode-job-storage'

const STORAGE_KEY = 'nostube_upload_drafts'
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024
const DEFAULT_MAX_CONCURRENT_CHUNKS = 2

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

const activeJobs = new Map<string, AbortController>()

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
  updateBrowserTranscodeJob(draftId, job => ({
    ...job,
    state: updater(job.state),
  }))
}

function parseCodecList(codecs: string | undefined): { videoCodec?: string; audioCodec?: string } {
  const codecList =
    codecs
      ?.split(',')
      .map(codec => codec.trim())
      .filter(Boolean) ?? []

  return {
    videoCodec: codecList.find(codec => /^(avc1|avc3|hvc1|hev1)/i.test(codec)),
    audioCodec: codecList.find(codec => /^(mp4a|ac-3|ec-3|opus)/i.test(codec)),
  }
}

function buildHlsMimeType(codecs: string | undefined): string {
  return codecs
    ? `application/vnd.apple.mpegurl; codecs="${codecs}"`
    : 'application/vnd.apple.mpegurl'
}

function parseMasterPlaylistStreams(masterContent: string): Map<
  string,
  {
    width: number
    height: number
    mimeType: string
    videoCodec?: string
    audioCodec?: string
  }
> {
  const lines = masterContent.split('\n').map(line => line.trim())
  const map = new Map<
    string,
    {
      width: number
      height: number
      mimeType: string
      videoCodec?: string
      audioCodec?: string
    }
  >()

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i)
    const codecs = line.match(/CODECS="([^"]+)"/i)?.[1]
    const playlistPath = lines[i + 1]
    if (!resolutionMatch || !playlistPath || playlistPath.startsWith('#')) continue
    const { videoCodec, audioCodec } = parseCodecList(codecs)
    map.set(playlistPath, {
      width: parseInt(resolutionMatch[1], 10),
      height: parseInt(resolutionMatch[2], 10),
      mimeType: buildHlsMimeType(codecs),
      videoCodec,
      audioCodec,
    })
  }

  return map
}

function computeVariantStreamBytes(
  variantPlaylistPath: string,
  variantPlaylistContent: string,
  files: Map<string, File>
): number {
  const companionDir = variantPlaylistPath.replace(/\.m3u8$/, '/')
  const lines = variantPlaylistContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))

  const referencedPaths = new Set<string>()
  for (const line of lines) {
    if (line.startsWith('http://') || line.startsWith('https://')) continue
    if (line.includes('/')) {
      referencedPaths.add(line)
    } else {
      referencedPaths.add(`${companionDir}${line}`)
    }
  }

  let total = 0
  referencedPaths.forEach(path => {
    total += files.get(path)?.size ?? 0
  })
  return total
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

/**
 * Normalises the MIME type of HLS binary files for Blossom server compatibility.
 *
 * mediabunny may emit types like "video/iso.segment" for .m4s CMAF segments,
 * which some Blossom servers refuse. We remap those to "video/mp4" so the upload
 * goes through while keeping the content identical.
 */
function normaliseHlsFile(file: File): File {
  const name = file.name.toLowerCase()
  const knownBinaryExts = ['.mp4', '.m4s', '.m4v', '.m4a']
  if (knownBinaryExts.some(ext => name.endsWith(ext)) && file.type !== 'video/mp4') {
    return new File([file], file.name, { type: 'video/mp4', lastModified: file.lastModified })
  }
  return file
}

async function uploadAndGetUrl(
  file: File,
  initialServers: string[],
  signer: Signer,
  onProgress?: (progress: ChunkedUploadProgress) => void
): Promise<{ url: string; blobs: BlobDescriptor[] }> {
  const uploadFile = normaliseHlsFile(file)
  const blobs = await uploadFileToMultipleServersChunked({
    file: uploadFile,
    servers: initialServers,
    signer,
    options: { chunkSize: DEFAULT_CHUNK_SIZE, maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS },
    callbacks: { onProgress },
    skipExistenceCheck: true, // HLS files are freshly generated — skip the HEAD round-trip
  })

  // uploadFileToMultipleServersChunked now throws when all servers fail,
  // so an empty array here means servers is an empty list.
  if (blobs.length === 0) throw new Error(`No upload servers configured`)
  return { url: blobs[0].url, blobs }
}

export function subscribeToBrowserTranscodeUploads(listener: BrowserTranscodeUploadListener) {
  return subscribeToBrowserTranscodeJobs(listener)
}

export type BrowserTranscodeUploadListener = Parameters<typeof subscribeToBrowserTranscodeJobs>[0]

export function getBrowserTranscodeUploadDraft(draftId: string) {
  return getBrowserTranscodeJob(draftId)
}

export function clearBrowserTranscodeUpload(draftId: string) {
  activeJobs.get(draftId)?.abort()
  activeJobs.delete(draftId)
  removeBrowserTranscodeJob(draftId)
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

  upsertBrowserTranscodeJob(draftId, {
    status: 'queued',
    mode,
    keepOriginal,
    sourceName: file.name,
    sourceSize: file.size,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    variants: getVariantStates(variants),
    message: 'Browser transcode queued.',
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
        ? await runBrowserTranscodeJob(
            file,
            variants,
            sourceMeta,
            ({ progress }) => {
              const now = Date.now()
              if (now - lastProgressTime > 500 || progress === 1) {
                lastProgressTime = now
                throttledUpdateProgress(progress)
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

    console.log(
      '[BrowserTranscodeUploadManager] Transcode result type:',
      transcodedFiles instanceof Map ? 'Map' : 'Array'
    )

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
      const uploadedUrls = new Map<string, string>()
      const hlsVariantStreams: Array<{
        url: string
        dimension: string
        qualityLabel: string
        sizeMB?: number
        mimeType?: string
        videoCodec?: string
        audioCodec?: string
      }> = []

      // Pre-compute total bytes across all files for accurate progress
      const allPaths = Array.from(transcodedFiles.keys())
      const segmentPaths = allPaths.filter(p => !p.endsWith('.m3u8'))
      const playlistPathsRaw = allPaths.filter(p => p.endsWith('.m3u8'))
      // +1 for master (rewritten copy uploaded separately)
      const totalFiles = segmentPaths.length + playlistPathsRaw.length + 1
      const totalBytes = allPaths.reduce((sum, p) => sum + (transcodedFiles.get(p)?.size ?? 0), 0)
      let uploadedBytes = 0

      const reportProgress = (filesUploaded: number, label: string) => {
        const pct =
          totalBytes > 0
            ? Math.round((uploadedBytes / totalBytes) * 100)
            : Math.round((filesUploaded / totalFiles) * 100)
        if (import.meta.env.DEV) {
          console.log(
            `[BrowserTranscodeUploadManager] reportProgress: ${filesUploaded}/${totalFiles} files, ${uploadedBytes}/${totalBytes} bytes, ${pct}%`
          )
        }
        updateBrowserState(draftId, state => ({
          ...state,
          updatedAt: Date.now(),
          message: label,
          uploadProgress: {
            uploadedBytes,
            totalBytes,
            percentage: pct,
            currentChunk: filesUploaded,
            totalChunks: totalFiles,
          },
        }))
      }

      // Show the progress bar immediately at 0%
      updateBrowserState(draftId, state => ({
        ...state,
        updatedAt: Date.now(),
        uploadProgress: {
          uploadedBytes: 0,
          totalBytes,
          percentage: 0,
          currentChunk: 0,
          totalChunks: totalFiles,
        },
      }))

      // Collect all blobs for later deletion support
      const allHlsBlobs: BlobDescriptor[] = []

      // Stage 1: Upload segments and init files
      for (let i = 0; i < segmentPaths.length; i++) {
        const path = segmentPaths[i]
        const hlsFile = transcodedFiles.get(path)!
        const { url, blobs } = await uploadAndGetUrl(hlsFile, initialServers, signer)
        uploadedUrls.set(path, url)
        allHlsBlobs.push(...blobs)
        uploadedBytes += hlsFile.size
        reportProgress(i + 1, `Uploading HLS segments (${i + 1}/${totalFiles})…`)
      }

      // Stage 2: Rewrite and upload variant playlists
      const rewrittenFiles = await rewriteHlsPlaylists(transcodedFiles, uploadedUrls)
      const masterPlaylistForMetadata = rewrittenFiles.get('master.m3u8')
      const streamMap = masterPlaylistForMetadata
        ? parseMasterPlaylistStreams(await masterPlaylistForMetadata.text())
        : new Map<
            string,
            {
              width: number
              height: number
              mimeType: string
              videoCodec?: string
              audioCodec?: string
            }
          >()
      const playlistPaths = Array.from(rewrittenFiles.keys()).filter(
        p => p.endsWith('.m3u8') && p !== 'master.m3u8'
      )

      for (let i = 0; i < playlistPaths.length; i++) {
        const path = playlistPaths[i]
        const playlistFile = rewrittenFiles.get(path)!
        const { url, blobs } = await uploadAndGetUrl(playlistFile, initialServers, signer)
        uploadedUrls.set(path, url)
        allHlsBlobs.push(...blobs)

        const parsedDims = streamMap.get(path)
        if (parsedDims) {
          const originalPlaylist = transcodedFiles.get(path)
          const streamBytes = computeVariantStreamBytes(
            path,
            originalPlaylist ? await originalPlaylist.text() : await playlistFile.text(),
            transcodedFiles
          )
          const totalVariantBytes = streamBytes + playlistFile.size

          hlsVariantStreams.push({
            url,
            dimension: `${parsedDims.width}x${parsedDims.height}`,
            qualityLabel: `${Math.min(parsedDims.width, parsedDims.height)}p`,
            sizeMB: totalVariantBytes > 0 ? totalVariantBytes / (1024 * 1024) : undefined,
            mimeType: parsedDims.mimeType,
            videoCodec: parsedDims.videoCodec,
            audioCodec: parsedDims.audioCodec,
          })
        }

        uploadedBytes += playlistFile.size
        reportProgress(
          segmentPaths.length + i + 1,
          `Uploading HLS playlists (${segmentPaths.length + i + 1}/${totalFiles})…`
        )
      }

      // Stage 3: Rewrite and upload master playlist
      const masterFile = rewrittenFiles.get('master.m3u8')!
      const finalRewritten = await rewriteHlsPlaylists(
        new Map([['master.m3u8', masterFile]]),
        uploadedUrls
      )
      const finalMaster = finalRewritten.get('master.m3u8')!
      const { url: masterUrl, blobs: masterBlobs } = await uploadAndGetUrl(
        finalMaster,
        initialServers,
        signer
      )
      allHlsBlobs.push(...masterBlobs)
      uploadedBytes += finalMaster.size
      reportProgress(totalFiles, `Uploading master playlist (${totalFiles}/${totalFiles})…`)

      console.log('[BrowserTranscodeUploadManager] HLS master playlist URL:', masterUrl)

      const sortedHlsVariantStreams = hlsVariantStreams.sort((a, b) => {
        const qa = parseInt(a.qualityLabel, 10) || 0
        const qb = parseInt(b.qualityLabel, 10) || 0
        return qb - qa
      })
      const highestHlsStream = sortedHlsVariantStreams[0]

      // Add HLS variant — use inputMethod:'url' so buildImetaTag uses variant.url directly.
      // Store all uploaded blobs (segments, playlists, master) so they can be deleted later.
      uploadedVideos.push({
        url: masterUrl,
        mimeType: 'application/vnd.apple.mpegurl',
        dimension: highestHlsStream?.dimension || `${sourceMeta.width}x${sourceMeta.height}`,
        qualityLabel: highestHlsStream?.qualityLabel,
        hlsVariants: sortedHlsVariantStreams,
        duration: sourceMeta.duration,
        uploadedBlobs: allHlsBlobs,
        mirroredBlobs: [],
        inputMethod: 'url',
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

    const draft = getItemsFromStorage<{
      id: string
      updatedAt: number
      uploadInfo: { videos: VideoVariant[] }
    }>(STORAGE_KEY).find(item => item.id === draftId)
    const currentVideos = draft?.uploadInfo.videos ?? []
    const videos = mode === 'append' ? [...currentVideos, ...uploadedVideos] : uploadedVideos

    upsertBrowserTranscodeJob(
      draftId,
      {
        status: 'complete',
        mode,
        keepOriginal,
        sourceName: file.name,
        sourceSize: file.size,
        startedAt: getBrowserTranscodeJob(draftId)?.state.startedAt ?? Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
        variants: getVariantStates(variants).map(variant => ({
          ...variant,
          progress: 1,
          status: 'done',
        })),
        message: 'Browser transcode and upload complete.',
      },
      videos
    )
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
