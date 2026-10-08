import {
  transcodeFile,
  transcodeToHls,
  type BrowserTranscodeVariant,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'

type WorkerRequest =
  | {
      type: 'start'
      jobId: string
      file: File
      variants: BrowserTranscodeVariant[]
      sourceMeta: TranscodeSourceMeta
    }
  | {
      type: 'cancel'
      jobId: string
    }

type WorkerResponse =
  | {
      type: 'progress'
      jobId: string
      variant?: BrowserTranscodeVariant
      variantIndex: number
      progress: number
    }
  | {
      type: 'variant-complete'
      jobId: string
      variant: BrowserTranscodeVariant
      variantIndex: number
      file: File
    }
  | {
      type: 'variant-error'
      jobId: string
      variant: BrowserTranscodeVariant
      variantIndex: number
      message: string
    }
  | {
      type: 'complete'
      jobId: string
      files: File[] | Map<string, File>
    }
  | {
      type: 'error'
      jobId: string
      message: string
      variantIndex?: number
    }
  | {
      type: 'cancelled'
      jobId: string
    }

let activeJobId: string | null = null
let activeAbortController: AbortController | null = null

function post(message: WorkerResponse) {
  self.postMessage(message)
}

async function runTranscodeJob(
  jobId: string,
  file: File,
  variants: BrowserTranscodeVariant[],
  sourceMeta: TranscodeSourceMeta
) {
  activeJobId = jobId
  activeAbortController = new AbortController()
  const signal = activeAbortController.signal

  try {
    const isHls = variants.some(v => v.format === 'hls')

    if (isHls) {
      const hlsFiles = await transcodeToHls(
        file,
        variants,
        sourceMeta,
        (variantIndex, progress) => {
          post({ type: 'progress', jobId, variant: variants[variantIndex], variantIndex, progress })
        },
        signal
      )
      post({ type: 'complete', jobId, files: hlsFiles })
      return
    }

    const files: File[] = []
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i]

      try {
        const transcoded = await transcodeFile(
          file,
          variant,
          sourceMeta,
          progress => {
            post({ type: 'progress', jobId, variant, variantIndex: i, progress })
          },
          signal
        )

        files.push(transcoded)
        post({ type: 'variant-complete', jobId, variant, variantIndex: i, file: transcoded })
      } catch (error) {
        if (signal.aborted) throw error

        post({
          type: 'variant-error',
          jobId,
          variant,
          variantIndex: i,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (files.length === 0) {
      post({ type: 'error', jobId, message: 'All transcode variants failed.' })
    } else {
      post({ type: 'complete', jobId, files })
    }
  } catch (error) {
    if (signal.aborted) {
      post({ type: 'cancelled', jobId })
      return
    }

    post({
      type: 'error',
      jobId,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (activeJobId === jobId) {
      activeJobId = null
      activeAbortController = null
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  if (message.type === 'cancel') {
    if (message.jobId === activeJobId) {
      activeAbortController?.abort()
    }
    return
  }

  if (activeJobId) {
    post({
      type: 'error',
      jobId: message.jobId,
      message: 'Browser transcode worker is already running a job.',
    })
    return
  }

  void runTranscodeJob(message.jobId, message.file, message.variants, message.sourceMeta)
}
