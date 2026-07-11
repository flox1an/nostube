import type { BlobDescriptor, Signer } from '@/lib/blossom-auth'
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_MAX_CONCURRENT_CHUNKS,
  uploadAndProcessFile,
} from '@/lib/transcode-upload'
import type { BrowserTranscodeState, BrowserTranscodeVariantState } from '@/types/upload-draft'
import {
  mirrorBlobsToServers,
  uploadFileToMultipleServersChunked,
  type ChunkedUploadProgress,
} from '@/lib/blossom-upload'
import type { VideoVariant } from '@/lib/video-processing'
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

function parseAudioRenditions(
  masterContent: string
): Map<string, { language?: string; name?: string }> {
  const lines = masterContent.split('\n').map(line => line.trim())
  const map = new Map<string, { language?: string; name?: string }>()
  for (const line of lines) {
    if (!line.startsWith('#EXT-X-MEDIA:') || !line.includes('TYPE=AUDIO')) continue
    const uri = line.match(/URI="([^"]+)"/)?.[1]
    if (!uri) continue
    map.set(uri, {
      language: line.match(/LANGUAGE="([^"]+)"/)?.[1],
      name: line.match(/NAME="([^"]+)"/)?.[1],
    })
  }
  return map
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
/* eslint-disable @typescript-eslint/no-explicit-any -- generic higher-order function; T extends (...args: any[]) is the standard TS pattern */
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
/* eslint-enable @typescript-eslint/no-explicit-any */

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

/** Run tasks with at most `concurrency` running at once. Results are in input order. */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

async function uploadAndGetUrl(
  file: File,
  initialServers: string[],
  signer: Signer,
  onProgress?: (progress: ChunkedUploadProgress) => void,
  signal?: AbortSignal
): Promise<{ url: string; blobs: BlobDescriptor[] }> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const uploadFile = normaliseHlsFile(file)
  const blobs = await uploadFileToMultipleServersChunked({
    file: uploadFile,
    servers: initialServers,
    signer,
    options: { chunkSize: DEFAULT_CHUNK_SIZE, maxConcurrentChunks: DEFAULT_MAX_CONCURRENT_CHUNKS },
    callbacks: { onProgress },
    skipExistenceCheck: true, // HLS files are freshly generated — skip the HEAD round-trip
    signal,
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

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
        type?: 'video' | 'audio'
        language?: string
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

      // ── Pre-parse variant playlists to build segment→(stream,server) mapping ──
      // One state row per (stream × server) so the UI can show per-server progress.
      type SegLoc = { stateIdx: number; segIdx: number }
      // Key: `${segmentPath}::${serverHostname}`
      const segmentLocations = new Map<string, SegLoc>()
      // Key: uploaded blob URL → location (for mirror tracking)
      const uploadedUrlToLoc = new Map<string, SegLoc>()

      const serverHostnames = initialServers.map(s => {
        try {
          return new URL(s).hostname
        } catch {
          return s
        }
      })
      const multiServer = serverHostnames.length > 1

      const initSegmentStates: Array<{
        streamLabel: string
        serverLabel?: string
        statuses: Array<'pending' | 'uploading' | 'done' | 'error'>
      }> = []

      // Collect segment paths per stream label (for building state entries below)
      const streamSegPaths: Array<{ label: string; segPaths: string[] }> = []

      const masterRaw = transcodedFiles.get('master.m3u8')
      if (masterRaw) {
        const masterText = await masterRaw.text()
        const masterLines = masterText.split('\n').map(l => l.trim())
        for (let i = 0; i < masterLines.length - 1; i++) {
          const line = masterLines[i]
          if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i)
          const variantPath = masterLines[i + 1]
          if (!variantPath || variantPath.startsWith('#')) continue
          const label = resMatch
            ? `${Math.min(parseInt(resMatch[1]), parseInt(resMatch[2]))}p`
            : `stream-${streamSegPaths.length}`
          i++

          const variantFile = transcodedFiles.get(variantPath)
          if (!variantFile) continue
          const variantText = await variantFile.text()
          const companionDir = variantPath.replace(/\.m3u8$/, '/')

          const segPaths: string[] = []
          for (const vLine of variantText.split('\n').map(l => l.trim())) {
            if (!vLine || vLine.startsWith('#')) {
              if (vLine.startsWith('#EXT-X-MAP:')) {
                const uriMatch = vLine.match(/URI="([^"]+)"/)
                if (uriMatch) {
                  const p = uriMatch[1].includes('/')
                    ? uriMatch[1]
                    : `${companionDir}${uriMatch[1]}`
                  if (transcodedFiles.has(p)) segPaths.push(p)
                }
              }
              continue
            }
            if (vLine.startsWith('http://') || vLine.startsWith('https://')) continue
            const p = vLine.includes('/') ? vLine : `${companionDir}${vLine}`
            if (transcodedFiles.has(p)) segPaths.push(p)
          }
          streamSegPaths.push({ label, segPaths })
        }

        // Parse audio renditions from master playlist
        for (const line of masterLines) {
          if (!line.startsWith('#EXT-X-MEDIA:') || !line.includes('TYPE=AUDIO')) continue
          const uriMatch = line.match(/URI="([^"]+)"/)
          if (!uriMatch) continue
          const audioPath = uriMatch[1]
          const language = line.match(/LANGUAGE="([^"]+)"/)?.[1]
          const name = line.match(/NAME="([^"]+)"/)?.[1]
          const label = name ? `audio (${name})` : language ? `audio (${language})` : 'audio'

          const audioFile = transcodedFiles.get(audioPath)
          if (!audioFile) continue
          const audioText = await audioFile.text()
          const companionDir = audioPath.replace(/\.m3u8$/, '/')

          const segPaths: string[] = []
          for (const aLine of audioText.split('\n').map(l => l.trim())) {
            if (!aLine || aLine.startsWith('#')) {
              if (aLine.startsWith('#EXT-X-MAP:')) {
                const uriM = aLine.match(/URI="([^"]+)"/)
                if (uriM) {
                  const p = uriM[1].includes('/') ? uriM[1] : `${companionDir}${uriM[1]}`
                  if (transcodedFiles.has(p)) segPaths.push(p)
                }
              }
              continue
            }
            if (aLine.startsWith('http://') || aLine.startsWith('https://')) continue
            const p = aLine.includes('/') ? aLine : `${companionDir}${aLine}`
            if (transcodedFiles.has(p)) segPaths.push(p)
          }
          streamSegPaths.push({ label, segPaths })
        }
      }

      // Build one state entry per (stream × server)
      for (const { label, segPaths } of streamSegPaths) {
        for (const hostname of serverHostnames) {
          const stateIdx = initSegmentStates.length
          initSegmentStates.push({
            streamLabel: label,
            serverLabel: multiServer ? hostname : undefined,
            statuses: segPaths.map(() => 'pending' as const),
          })
          segPaths.forEach((p, segIdx) =>
            segmentLocations.set(`${p}::${hostname}`, { stateIdx, segIdx })
          )
        }
      }

      // Mutable copy for in-place updates; flushed to state at most every 150ms
      const liveStatuses: Array<Array<'pending' | 'uploading' | 'done' | 'error'>> =
        initSegmentStates.map(s => [...s.statuses])

      const flushSegmentStates = throttle(() => {
        updateBrowserState(draftId, state => ({
          ...state,
          segmentStates: initSegmentStates.map((s, si) => ({
            streamLabel: s.streamLabel,
            serverLabel: s.serverLabel,
            statuses: [...liveStatuses[si]],
          })),
        }))
      }, 150)

      if (initSegmentStates.length > 0) {
        updateBrowserState(draftId, state => ({ ...state, segmentStates: initSegmentStates }))
      }
      // ─────────────────────────────────────────────────────────────────────────

      // Stage 1: Upload segments and init files — 2 concurrent uploads
      let segmentsUploaded = 0
      await runWithConcurrency(
        segmentPaths.map(path => async () => {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

          // Mark all server rows for this segment as 'uploading'
          for (const hostname of serverHostnames) {
            const loc = segmentLocations.get(`${path}::${hostname}`)
            if (loc) liveStatuses[loc.stateIdx][loc.segIdx] = 'uploading'
          }
          flushSegmentStates()

          const hlsFile = transcodedFiles.get(path)!
          const { url, blobs } = await uploadAndGetUrl(
            hlsFile,
            initialServers,
            signer,
            undefined,
            controller.signal
          )
          uploadedUrls.set(path, url)
          allHlsBlobs.push(...blobs)
          uploadedBytes += hlsFile.size
          segmentsUploaded++

          // Mark per-server: done if blob returned from that server, error otherwise
          const succeededHostnames = new Set(
            blobs.map(b => {
              try {
                return new URL(b.url).hostname
              } catch {
                return ''
              }
            })
          )
          for (const hostname of serverHostnames) {
            const loc = segmentLocations.get(`${path}::${hostname}`)
            if (loc) {
              liveStatuses[loc.stateIdx][loc.segIdx] = succeededHostnames.has(hostname)
                ? 'done'
                : 'error'
            }
          }
          // Track uploaded URLs for mirror phase
          for (const blob of blobs) {
            try {
              const hostname = new URL(blob.url).hostname
              const loc = segmentLocations.get(`${path}::${hostname}`)
              if (loc) uploadedUrlToLoc.set(blob.url, loc)
            } catch {
              /* ignore */
            }
          }
          flushSegmentStates()

          reportProgress(
            segmentsUploaded,
            `Uploading HLS segments (${segmentsUploaded}/${totalFiles})…`
          )
        }),
        2
      )

      // Stage 2: Rewrite and upload variant playlists
      const rewrittenFiles = await rewriteHlsPlaylists(transcodedFiles, uploadedUrls)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const masterPlaylistForMetadata = rewrittenFiles.get('master.m3u8')
      const masterPlaylistContent = masterPlaylistForMetadata
        ? await masterPlaylistForMetadata.text()
        : null
      const streamMap = masterPlaylistContent
        ? parseMasterPlaylistStreams(masterPlaylistContent)
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
      const audioMap = masterPlaylistContent
        ? parseAudioRenditions(masterPlaylistContent)
        : new Map<string, { language?: string; name?: string }>()
      const playlistPaths = Array.from(rewrittenFiles.keys()).filter(
        p => p.endsWith('.m3u8') && p !== 'master.m3u8'
      )

      // Stage 2: Rewrite and upload variant playlists — 2 concurrent
      let playlistsUploaded = 0
      await runWithConcurrency(
        playlistPaths.map(path => async () => {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const playlistFile = rewrittenFiles.get(path)!
          const { url, blobs } = await uploadAndGetUrl(
            playlistFile,
            initialServers,
            signer,
            undefined,
            controller.signal
          )
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

          const audioInfo = audioMap.get(path)
          if (audioInfo) {
            const originalAudio = transcodedFiles.get(path)
            const audioBytes = computeVariantStreamBytes(
              path,
              originalAudio ? await originalAudio.text() : await playlistFile.text(),
              transcodedFiles
            )
            const totalAudioBytes = audioBytes + playlistFile.size
            const label = audioInfo.name ?? audioInfo.language ?? 'audio'
            hlsVariantStreams.push({
              type: 'audio',
              language: audioInfo.language,
              url,
              dimension: '-',
              qualityLabel: label,
              sizeMB: totalAudioBytes > 0 ? totalAudioBytes / (1024 * 1024) : undefined,
            })
          }

          uploadedBytes += playlistFile.size
          playlistsUploaded++
          reportProgress(
            segmentsUploaded + playlistsUploaded,
            `Uploading HLS playlists (${segmentsUploaded + playlistsUploaded}/${totalFiles})…`
          )
        }),
        2
      )

      // Stage 3: Rewrite and upload master playlist
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const masterFile = rewrittenFiles.get('master.m3u8')!
      const finalRewritten = await rewriteHlsPlaylists(
        new Map([['master.m3u8', masterFile]]),
        uploadedUrls
      )
      const finalMaster = finalRewritten.get('master.m3u8')!
      const { url: masterUrl, blobs: masterBlobs } = await uploadAndGetUrl(
        finalMaster,
        initialServers,
        signer,
        undefined,
        controller.signal
      )
      allHlsBlobs.push(...masterBlobs)
      uploadedBytes += finalMaster.size
      reportProgress(totalFiles, `Uploading master playlist (${totalFiles}/${totalFiles})…`)

      console.log('[BrowserTranscodeUploadManager] HLS master playlist URL:', masterUrl)

      // Stage 4: Mirror all HLS blobs to mirror servers
      let hlsMirroredBlobs: BlobDescriptor[] = []
      if (mirrorServers.length > 0 && allHlsBlobs.length > 0) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        let mirrored = 0
        const total = allHlsBlobs.length

        // Initialize mirror segment states from the same stream structure
        const liveMirrorStatuses: Array<Array<'pending' | 'mirroring' | 'done' | 'error'>> =
          initSegmentStates.map(s => s.statuses.map(() => 'pending' as const))

        const flushMirrorStates = throttle(() => {
          updateBrowserState(draftId, state => ({
            ...state,
            mirrorSegmentStates: initSegmentStates.map((s, si) => ({
              streamLabel: s.streamLabel,
              statuses: [...liveMirrorStatuses[si]],
            })),
          }))
        }, 150)

        if (initSegmentStates.length > 0) {
          updateBrowserState(draftId, state => ({
            ...state,
            mirrorProgress: { mirrored: 0, total, percentage: 0 },
            mirrorSegmentStates: initSegmentStates.map(s => ({
              streamLabel: s.streamLabel,
              statuses: s.statuses.map(() => 'pending' as const),
            })),
          }))
        } else {
          updateBrowserState(draftId, state => ({
            ...state,
            mirrorProgress: { mirrored: 0, total, percentage: 0 },
          }))
        }

        const mirrorResults = await runWithConcurrency(
          allHlsBlobs.map(blob => async () => {
            if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
            const loc = uploadedUrlToLoc.get(blob.url)
            if (loc) {
              liveMirrorStatuses[loc.stateIdx][loc.segIdx] = 'mirroring'
              flushMirrorStates()
            }
            const result = await mirrorBlobsToServers({ mirrorServers, blob, signer })
            mirrored++
            if (loc) {
              liveMirrorStatuses[loc.stateIdx][loc.segIdx] = 'done'
              flushMirrorStates()
            }
            updateBrowserState(draftId, state => ({
              ...state,
              mirrorProgress: {
                mirrored,
                total,
                percentage: Math.round((mirrored / total) * 100),
              },
            }))
            return result
          }),
          4
        )
        hlsMirroredBlobs = mirrorResults.flat()
        updateBrowserState(draftId, state => ({
          ...state,
          mirrorProgress: { mirrored: total, total, percentage: 100 },
        }))
      }

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
        mirroredBlobs: hlsMirroredBlobs,
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
          },
          controller.signal
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
