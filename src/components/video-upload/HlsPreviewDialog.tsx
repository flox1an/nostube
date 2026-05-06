import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { useToast } from '@/hooks/useToast'

interface HlsPreviewDialogProps {
  url: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HlsPreviewDialog({ url, open, onOpenChange }: HlsPreviewDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    const video = videoRef.current
    if (!video || !url || !open) return

    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = url
    }
  }, [url, open])

  useEffect(() => {
    if (!open) {
      hlsRef.current?.destroy()
      hlsRef.current = null
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
            className="w-full rounded-md bg-black"
            style={{ aspectRatio: '16/9' }}
          />
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
