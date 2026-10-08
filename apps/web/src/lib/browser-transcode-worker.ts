import type { BrowserTranscodeVariant, TranscodeSourceMeta } from '@/lib/video-transcode'

export interface BrowserTranscodeJobProgress {
  variant?: BrowserTranscodeVariant
  variantIndex: number
  progress: number
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

interface PendingJob {
  file: File
  variants: BrowserTranscodeVariant[]
  sourceMeta: TranscodeSourceMeta
  onProgress: (progress: BrowserTranscodeJobProgress) => void
  onVariantError: (variantIndex: number, message: string) => void
  resolve: (files: File[] | Map<string, File>) => void
  reject: (error: Error) => void
  signal: AbortSignal
}

class BrowserTranscodeWorkerQueue {
  private worker: Worker | null = null
  private activeJobId: string | null = null
  private pendingJobs = new Map<string, PendingJob>()
  private queuedJobIds: string[] = []

  run(
    file: File,
    variants: BrowserTranscodeVariant[],
    sourceMeta: TranscodeSourceMeta,
    onProgress: (progress: BrowserTranscodeJobProgress) => void,
    onVariantError: (variantIndex: number, message: string) => void,
    signal: AbortSignal
  ): Promise<File[] | Map<string, File>> {
    const jobId = crypto.randomUUID()

    return new Promise((resolve, reject) => {
      const job: PendingJob = {
        file,
        variants,
        sourceMeta,
        onProgress,
        onVariantError,
        resolve,
        reject,
        signal,
      }

      const abort = () => {
        this.cancel(jobId)
      }

      if (signal.aborted) {
        abort()
        return
      }

      signal.addEventListener('abort', abort, { once: true })
      const cleanupResolve = (files: File[] | Map<string, File>) => {
        signal.removeEventListener('abort', abort)
        resolve(files)
      }
      const cleanupReject = (error: Error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }

      this.pendingJobs.set(jobId, { ...job, resolve: cleanupResolve, reject: cleanupReject })
      this.queuedJobIds.push(jobId)
      this.startNext()
    })
  }

  cancel(jobId: string) {
    const job = this.pendingJobs.get(jobId)

    if (this.activeJobId === jobId) {
      this.worker?.postMessage({ type: 'cancel', jobId })
      this.worker?.terminate()
      this.worker = null
      job?.reject(new DOMException('Aborted', 'AbortError'))
      this.finishJob(jobId)
      return
    }

    this.queuedJobIds = this.queuedJobIds.filter(id => id !== jobId)
    this.pendingJobs.delete(jobId)
    job?.reject(new DOMException('Aborted', 'AbortError'))
  }

  private getWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/browserTranscode.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleMessage(event.data)
      }
      this.worker.onerror = event => {
        const jobId = this.activeJobId
        if (!jobId) return
        const job = this.pendingJobs.get(jobId)
        job?.reject(new Error(event.message || 'Browser transcode worker failed'))
        this.finishJob(jobId)
      }
    }

    return this.worker
  }

  private startNext() {
    if (this.activeJobId) return

    const jobId = this.queuedJobIds.shift()
    if (!jobId) return

    const job = this.pendingJobs.get(jobId)
    if (!job) {
      this.startNext()
      return
    }

    this.activeJobId = jobId
    this.getWorker().postMessage({
      type: 'start',
      jobId,
      file: job.file,
      variants: job.variants,
      sourceMeta: job.sourceMeta,
    })
  }

  private handleMessage(message: WorkerResponse) {
    const job = this.pendingJobs.get(message.jobId)
    if (!job) return

    if (message.type === 'progress') {
      job.onProgress({
        variant: message.variant,
        variantIndex: message.variantIndex,
        progress: message.progress,
      })
      return
    }

    if (message.type === 'complete') {
      job.resolve(message.files)
      this.finishJob(message.jobId)
      return
    }

    if (message.type === 'variant-error') {
      job.onVariantError(message.variantIndex, message.message)
      return
    }

    if (message.type === 'cancelled') {
      job.reject(new DOMException('Aborted', 'AbortError'))
      this.finishJob(message.jobId)
      return
    }

    if (message.type === 'error') {
      job.reject(new Error(message.message))
      this.finishJob(message.jobId)
    }
  }

  private finishJob(jobId: string) {
    this.pendingJobs.delete(jobId)
    if (this.activeJobId === jobId) this.activeJobId = null
    this.startNext()
  }
}

const browserTranscodeWorkerQueue = new BrowserTranscodeWorkerQueue()

export function runBrowserTranscodeJob(
  file: File,
  variants: BrowserTranscodeVariant[],
  sourceMeta: TranscodeSourceMeta,
  onProgress: (progress: BrowserTranscodeJobProgress) => void,
  onVariantError: (variantIndex: number, message: string) => void,
  signal: AbortSignal
) {
  return browserTranscodeWorkerQueue.run(
    file,
    variants,
    sourceMeta,
    onProgress,
    onVariantError,
    signal
  )
}
