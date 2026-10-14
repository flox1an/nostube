import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BRANDING_SLOTS, type BrandingSlot } from '@nostube/core/instance-config'
import { Button } from '@nostube/widgets/components/button'
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
import { CROP_SOURCE_LIMIT, ImageCropDialog } from './ImageCropDialog'
import { useSigner } from './signer-context'
import { uploadBlob } from './upload/blossom-upload'
import { sha256File } from './upload/sha256-file'
import { signChecked } from './upload/sign'

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
  // Favicon and app icon go up as they are; logo and banner are cropped to a WebP first.
  const direct = slot === 'favicon' || slot === 'icon'

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

  const pick = (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)
    if (direct) {
      const problem = brandingProblem(slot, file)
      if (problem) setError(problem)
      else void run(() => uploadBranding(slot, file))
    } else if (!BRANDING_LIMITS[slot].types.includes(file.type)) {
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
      const sha256 = await sha256File(file)
      await uploadBlob({
        file,
        fileName: file.name,
        sha256,
        type: file.type,
        sign: event => signChecked(signer, event, pubkey),
      })
      onChange(await setBrandingBlob(slot, sha256))
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
          accept={BRANDING_LIMITS[slot].types.join(',')}
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
      {source && !direct && (
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
