import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useAppContextSafe } from '@/hooks/useAppContext'
import { createBlossomHlsLoader } from '@/lib/hls-blossom-loader'

interface HlsPreviewDialogProps {
  url: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const LOG = '[HlsPreviewDialog]'

export function HlsPreviewDialog({ url, open, onOpenChange }: HlsPreviewDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()
  const appContext = useAppContextSafe()
  const blossomServers = appContext?.config.blossomServers ?? []
  const cachingServers = appContext?.config.cachingServers ?? []

  useEffect(() => {
    console.log(LOG, 'effect triggered', {
      url,
      open,
      hasVideoElement: !!videoElement,
      blossomServers: blossomServers.map(s => s.url),
      cachingServers: cachingServers.map(s => s.url),
    })

    const video = videoElement
    if (!video || !url || !open) {
      console.log(LOG, 'early return — guard failed', {
        hasVideo: !!video,
        hasUrl: !!url,
        open,
      })
      return
    }

    hlsRef.current?.destroy()
    hlsRef.current = null
    video.removeAttribute('src')
    video.muted = true
    video.load()
    setTimeout(() => {
      setIsLoading(true)
      setError(null)
    }, 0)

    const hlsSupported = Hls.isSupported()
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
    console.log(LOG, 'playback path check', { hlsSupported, nativeHls, url })

    if (hlsSupported) {
      console.log(LOG, 'using hls.js', { url })
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        loader: createBlossomHlsLoader({
          blossomServers,
          cachingServers,
          masterUrl: url,
        }),
      })
      hlsRef.current = hls

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        console.log(LOG, 'MEDIA_ATTACHED → loadSource', { url })
        hls.loadSource(url)
      })

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        console.log(LOG, 'MANIFEST_PARSED → play()', {
          levels: data.levels.length,
          firstLevel: data.firstLevel,
        })
        setIsLoading(false)
        video.play().catch(err => {
          console.warn(LOG, 'play() rejected (autoplay policy?)', err)
          // Autoplay may be blocked; controls are visible for manual playback.
        })
      })

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error(LOG, 'HLS error', {
          fatal: data.fatal,
          type: data.type,
          details: data.details,
          url: data.url,
          response: data.response,
        })

        if (!data.fatal) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setIsLoading(false)
          const statusCode =
            typeof data.response?.code === 'number' ? ` (HTTP ${data.response.code})` : ''
          setError(`HLS playlist or segment could not be loaded: ${data.details}${statusCode}`)
          hls.destroy()
          hlsRef.current = null
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.log(LOG, 'attempting recoverMediaError()')
          hls.recoverMediaError()
          return
        }

        setIsLoading(false)
        setError(`HLS playback failed: ${data.details}`)
        hls.destroy()
        hlsRef.current = null
      })

      console.log(LOG, 'attachMedia()')
      hls.attachMedia(video)
      return () => {
        console.log(LOG, 'cleanup: destroy hls')
        hls.destroy()
        hlsRef.current = null
        video.removeAttribute('src')
        video.load()
      }
    } else if (nativeHls) {
      // Native HLS (Safari)
      console.log(LOG, 'using native HLS (Safari)', { url })
      video.src = url
      video.load()
      const playNative = () => {
        console.log(LOG, 'loadedmetadata → play() (native)')
        setIsLoading(false)
        video.play().catch(err => {
          console.warn(LOG, 'native play() rejected', err)
          // Autoplay may be blocked; controls are visible for manual playback.
        })
      }
      video.addEventListener('loadedmetadata', playNative, { once: true })
      return () => {
        video.removeEventListener('loadedmetadata', playNative)
        video.removeAttribute('src')
        video.load()
      }
    }

    console.warn(LOG, 'HLS not supported in this browser')
    setTimeout(() => {
      setIsLoading(false)
      setError('HLS playback is not supported in this browser.')
    }, 0)
  }, [url, open, blossomServers, cachingServers, videoElement])

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
      <DialogContent className="w-[90vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle>HLS Preview</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <video
            key={url ?? 'empty'}
            ref={node => {
              videoRef.current = node
              setVideoElement(node)
            }}
            controls
            autoPlay
            muted
            playsInline
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
