import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { cropRect } from './image-crop'
import { encodeImage, imageFileName } from '@nostube/core/image-encode'

export const CROP_SOURCE_LIMIT = 20 * 1024 * 1024
/** What the dialog can open: anything a canvas draws (the export decides the stored type). */
export const CROP_SOURCE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
const SIZES = {
  // Shown at 64 px at most (header); 256 px covers 4x screens.
  logo: { width: 256, height: 256, bytes: 128 * 1024 },
  banner: { width: 1500, height: 500, bytes: 300 * 1024 },
  // The manifest and iOS want a square PNG of 512×512 (the server refuses less): exactly that,
  // small sources are scaled up. Any 512×512 PNG fits the server's 2 MB.
  icon: { width: 512, height: 512, bytes: 2048 * 1024 },
}

/** The banner's shape on wide screens (phones show the whole 3:1 crop). */
const WIDE_BANNER = 5

/**
 * The source stays in the browser; only a confirmed, resized image leaves this dialog: WebP for
 * logo and banner (PNG for the logo, JPEG for the banner where the browser cannot encode WebP, as
 * in Safari), PNG for the app icon.
 */
export function ImageCropDialog({
  file,
  slot,
  onConfirm,
  onClose,
}: {
  file: File
  slot: 'logo' | 'banner' | 'icon'
  onConfirm: (file: File) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const drag = useRef<{ x: number; y: number; position: typeof position } | null>(null)
  const size = SIZES[slot]
  const aspect = size.width / size.height

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setLoaded({ url, image })
    image.onerror = () => setError(t('studio.branding.crop.loadError'))
    image.src = url
    return () => {
      image.onload = image.onerror = null
      URL.revokeObjectURL(url)
    }
  }, [file, t])

  const crop =
    loaded &&
    cropRect(loaded.image.naturalWidth, loaded.image.naturalHeight, aspect, zoom, position)
  const confirm = async () => {
    if (!loaded || !crop || saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      const canvas = document.createElement('canvas')
      // Logo and banner never upscale small sources; the icon is always 512×512.
      let width =
        slot === 'icon' ? size.width : Math.max(1, Math.min(size.width, Math.floor(crop.width)))
      const context = canvas.getContext('2d')
      if (!context) throw new Error(t('studio.branding.crop.encodeError'))
      let blob: Blob | null = null
      while (width >= 1) {
        canvas.width = width
        canvas.height = Math.max(1, Math.round(width / aspect))
        context.imageSmoothingQuality = 'high'
        context.drawImage(
          loaded.image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          canvas.width,
          canvas.height
        )
        for (const quality of [0.85, 0.7, 0.5]) {
          blob =
            slot === 'icon'
              ? await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
              : // A logo may be transparent: its non-WebP fallback (Safari) is PNG, not JPEG.
                await encodeImage(canvas, quality, slot === 'logo' ? 'image/png' : 'image/jpeg')
          if (!blob) throw new Error(t('studio.branding.crop.encodeError'))
          if (blob.size <= size.bytes) break
        }
        if (blob && blob.size <= size.bytes) break
        width = Math.floor(width * 0.75)
      }
      if (!blob || blob.size > size.bytes) throw new Error(t('studio.branding.crop.encodeError'))
      await onConfirm(new File([blob], imageFileName(slot, blob), { type: blob.type }))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !saving.current) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={e => {
          if (busy) e.preventDefault()
        }}
        onPointerDownOutside={e => {
          if (busy) e.preventDefault()
        }}
      >
        <DialogTitle>
          {t('studio.branding.crop.title', { image: t(`studio.branding.slots.${slot}`) })}
        </DialogTitle>
        <DialogDescription>
          {t(
            slot === 'icon'
              ? 'studio.branding.crop.descriptionIcon'
              : 'studio.branding.crop.description',
            {
              ...size,
              kilobytes: size.bytes / 1024,
            }
          )}
        </DialogDescription>
        {slot === 'banner' && (
          <p className="text-sm text-muted-foreground">{t('studio.branding.crop.wideHint')}</p>
        )}
        <div
          className={`relative mx-auto shrink-0 touch-none overflow-hidden rounded-md bg-muted ${busy ? '' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ aspectRatio: aspect, width: `min(100%, ${40 * aspect}dvh)` }}
          onPointerDown={e => {
            if (!crop || busy) return
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { x: e.clientX, y: e.clientY, position }
          }}
          onPointerMove={e => {
            if (!drag.current || !loaded || !crop) return
            const scale = crop.width / e.currentTarget.getBoundingClientRect().width
            const xSpace = loaded.image.naturalWidth - crop.width
            const ySpace = loaded.image.naturalHeight - crop.height
            const start = drag.current
            setPosition({
              x:
                xSpace > 0
                  ? Math.max(
                      0,
                      Math.min(1, start.position.x - ((e.clientX - start.x) * scale) / xSpace)
                    )
                  : 0.5,
              y:
                ySpace > 0
                  ? Math.max(
                      0,
                      Math.min(1, start.position.y - ((e.clientY - start.y) * scale) / ySpace)
                    )
                  : 0.5,
            })
          }}
          onPointerUp={() => {
            drag.current = null
          }}
          onPointerCancel={() => {
            drag.current = null
          }}
        >
          {loaded && crop && (
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`}
              role="img"
              aria-label={t('studio.branding.crop.preview')}
            >
              <image
                href={loaded.url}
                width={loaded.image.naturalWidth}
                height={loaded.image.naturalHeight}
              />
              <path
                d={`M ${crop.x + crop.width / 3} ${crop.y} v ${crop.height} M ${crop.x + (crop.width * 2) / 3} ${crop.y} v ${crop.height} M ${crop.x} ${crop.y + crop.height / 3} h ${crop.width} M ${crop.x} ${crop.y + (crop.height * 2) / 3} h ${crop.width}`}
                stroke="white"
                strokeOpacity="0.35"
                strokeWidth={crop.width / 600}
                fill="none"
                pointerEvents="none"
              />
              {slot === 'banner' && (
                // Wide screens show the banner at 5:1 (`sm:aspect-[5/1] object-cover` in
                // apps/site/src/SiteHome.tsx, also the studio preview): only the middle band.
                <g fill="black" fillOpacity="0.5" pointerEvents="none">
                  <rect
                    x={crop.x}
                    y={crop.y}
                    width={crop.width}
                    height={(crop.height - crop.width / WIDE_BANNER) / 2}
                  />
                  <rect
                    x={crop.x}
                    y={crop.y + (crop.height + crop.width / WIDE_BANNER) / 2}
                    width={crop.width}
                    height={(crop.height - crop.width / WIDE_BANNER) / 2}
                  />
                </g>
              )}
            </svg>
          )}
        </div>
        <div className="space-y-3">
          <label className="grid gap-1 text-sm">
            {t('studio.branding.crop.zoom')}
            <input
              type="range"
              min="1"
              max="4"
              step="0.01"
              value={zoom}
              disabled={!loaded || busy}
              onChange={e => setZoom(Number(e.target.value))}
            />
          </label>
          {(['x', 'y'] as const).map(axis => (
            <label key={axis} className="grid gap-1 text-sm">
              {t(`studio.branding.crop.${axis}`)}
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={position[axis]}
                disabled={!loaded || busy}
                onChange={e => setPosition(p => ({ ...p, [axis]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t('studio.videos.cancel')}
          </Button>
          <Button type="button" disabled={!loaded || busy} onClick={() => void confirm()}>
            {t(busy ? 'studio.branding.crop.saving' : 'studio.branding.crop.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
