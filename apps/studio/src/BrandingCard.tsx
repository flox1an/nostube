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
} from './api'

export interface BrandingProps {
  branding: AdminState['branding']
  onBranding: (slot: BrandingSlot, url: string | null) => void
}

/** Logo, favicon and banner: uploaded and removed at once, outside the config save. */
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
  const label = t(`studio.branding.slots.${slot}`)

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
    const problem = brandingProblem(slot, file)
    if (problem) setError(problem)
    else void run(() => uploadBranding(slot, file))
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
          {t(`studio.branding.hints.${slot}`, { size: BRANDING_LIMITS[slot].size })}
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
    </div>
  )
}
