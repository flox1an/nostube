import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'

interface HlsPreviewDialogProps {
  url: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HlsPreviewDialog({ url, open, onOpenChange }: HlsPreviewDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url || !open) return

    hlsRef.current?.destroy()
    hlsRef.current = null
    video.removeAttribute('src')
    video.load()
    setTimeout(() => {
      setIsLoading(true)
      setError(null)
    }, 0)

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      })
      hlsRef.current = hls

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(url)
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false)
        video.play().catch(() => {
          // Autoplay may be blocked; controls are visible for manual playback.
        })
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          return
        }

        setIsLoading(false)
        setError(`HLS playback failed: ${data.details}`)
        hls.destroy()
        hlsRef.current = null
      })

      hls.attachMedia(video)
      return () => {
        hls.destroy()
        hlsRef.current = null
        video.removeAttribute('src')
        video.load()
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = url
      video.load()
      setTimeout(() => setIsLoading(false), 0)
      return () => {
        video.removeAttribute('src')
        video.load()
      }
    }

    setTimeout(() => {
      setIsLoading(false)
      setError('HLS playback is not supported in this browser.')
    }, 0)
  }, [url, open])

  useEffect(() => {
    if (!open) {
      hlsRef.current?.destroy()
      hlsRef.current = null
      setTimeout(() => {
        setIsLoading(false)
        setError(null)
      }, 0)
    }
  }, [open])

  const handleCopyUrl = async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast({ title: 'URL copied' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>HLS Preview</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <video
            ref={videoRef}
            controls
            crossOrigin="anonymous"
            className="w-full rounded-md bg-black"
            style={{ aspectRatio: '16/9' }}
          />
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading HLS playlist...
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {url && (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
              <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
