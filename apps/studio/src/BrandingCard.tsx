import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRANDING_SLOTS, type BrandingSlot } from '@nostube/core/instance-config'
import { Button } from '@nostube/widgets/components/button'
import { beginPublication, updatePublication } from '@nostube/widgets/publication'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import {
  BRANDING_LIMITS,
  brandingProblem,
  deleteBranding,
  uploadBranding,
  type AdminState,
  setBrandingBlob,
} from './api'
import { CROP_SOURCE_LIMIT, CROP_SOURCE_TYPES, ImageCropDialog } from './ImageCropDialog'
import { useSigner } from './signer-context'
import { uploadBlob } from './upload/blossom-upload'
import { sha256File } from './upload/sha256-file'
import { signUploadAuth } from './upload/sign'

export interface BrandingProps {
  branding: AdminState['branding']
  onBranding: (slot: BrandingSlot, url: string | null) => void
}

/** Logo, favicon, banner and app icon: uploaded and removed at once, outside the config save. */
export function BrandingCard({ branding, onBranding }: BrandingProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studio.branding.title')}</CardTitle>
        <CardDescription>{t('studio.branding.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {BRANDING_SLOTS.map(slot => (
          <SlotRow
            key={slot}
            slot={slot}
            url={branding[slot]}
            onChange={url => onBranding(slot, url)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function SlotRow({
  slot,
  url,
  onChange,
}: {
  slot: BrandingSlot
  url: string | null
  onChange: (url: string | null) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<File | null>(null)
  const { signer, pubkey } = useSigner()
  const label = t(`studio.branding.slots.${slot}`)
  // The favicon goes up as it is; logo, banner and app icon are cropped and resized first.
  const direct = slot === 'favicon'

  const run = async (action: () => Promise<string | null>) => {
    setError(null)
    setBusy(true)
    try {
      onChange(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * One upload as a shared activity: its failure stays retryable from there, a retry clears it.
   * The server's own profile update afterwards has no event to follow and is not claimed.
   */
  const track = (work: (activity: string) => Promise<string>) => {
    const activity = beginPublication({
      label: `${t('studio.branding.title')}: ${label}`,
      phase: 'uploading',
      lifetime: 'browser',
    })
    const attempt = async () => {
      updatePublication(activity, { status: 'pending', error: undefined, retry: undefined })
      try {
        const url = await work(activity)
        updatePublication(activity, { status: 'success' })
        onChange(url)
        return url
      } catch (e) {
        updatePublication(activity, {
          status: 'failed',
          error: e instanceof Error ? e.message : String(e),
          retry: attempt,
        })
        throw e
      }
    }
    return attempt()
  }

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)
    if (direct) {
      const problem = brandingProblem(slot, file)
      if (problem) setError(problem)
      else
        void run(() =>
          track(async activity => {
            // One request: its bytes count as there once the server has answered.
            updatePublication(activity, { completed: 0, total: file.size, unit: 'bytes' })
            const url = await uploadBranding(slot, file)
            updatePublication(activity, { completed: file.size })
            return url
          })
        )
    } else if (!CROP_SOURCE_TYPES.includes(file.type)) {
      setError(t('studio.branding.errors.wrongType'))
    } else if (file.size > CROP_SOURCE_LIMIT) {
      setError(t('studio.branding.errors.tooBig', { size: '20 MB' }))
    } else {
      setSource(file)
    }
  }

  const uploadCrop = async (file: File) => {
    if (!signer || !pubkey) throw new Error(t('studio.errors.noSigner'))
    setBusy(true)
    try {
      await track(async activity => {
        const progress = (done: number, total: number) =>
          updatePublication(activity, { completed: done, total })
        updatePublication(activity, {
          phase: 'preparing',
          completed: 0,
          total: file.size,
          unit: 'bytes',
        })
        const sha256 = await sha256File(file, progress)
        updatePublication(activity, { phase: 'uploading', completed: 0, total: file.size })
        await uploadBlob({
          file,
          fileName: file.name,
          sha256,
          type: file.type,
          onProgress: progress,
          sign: event => signUploadAuth(activity, signer, event, pubkey),
        })
        updatePublication(activity, {
          phase: 'processing',
          completed: undefined,
          total: undefined,
          unit: undefined,
        })
        return setBrandingBlob(slot, sha256)
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className={`flex h-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted ${
          slot === 'banner' ? 'w-40' : 'w-16'
        }`}
      >
        {url ? (
          <img
            src={url}
            alt={label}
            className={slot === 'banner' ? 'h-full w-full object-cover' : 'max-h-full max-w-full'}
          />
        ) : (
          <span className="text-xs text-muted-foreground">{t('studio.branding.none')}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {t(`studio.branding.hints.${slot}`, {
            size: direct ? BRANDING_LIMITS[slot].size : '20 MB',
          })}
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={input}
          type="file"
          accept={(direct ? BRANDING_LIMITS[slot].types : CROP_SOURCE_TYPES).join(',')}
          aria-label={label}
          className="sr-only"
          tabIndex={-1}
          onChange={e => pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {url ? t('studio.branding.replace') : t('studio.branding.upload')}
        </Button>
        {url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await deleteBranding(slot)
                return null
              })
            }
          >
            {t('studio.branding.remove')}
          </Button>
        )}
      </div>
      {source && slot !== 'favicon' && (
        <ImageCropDialog
          file={source}
          slot={slot}
          onConfirm={uploadCrop}
          onClose={() => setSource(null)}
        />
      )}
    </div>
  )
}
