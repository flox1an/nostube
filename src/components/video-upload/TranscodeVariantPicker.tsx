import { Checkbox } from '@/components/ui/checkbox'
import {
  BROWSER_TRANSCODE_AUDIO_BITRATE,
  assignMp4ResolutionCodecs,
  computeBrowserTranscodeVideoBitrate,
  computeTargetDimensions,
  type ResolutionOption,
  type TranscodeSourceMeta,
} from '@/lib/video-transcode'

function estimateVariantSizeMB(height: number, sourceMeta: TranscodeSourceMeta): number {
  const { width, height: h } = computeTargetDimensions(
    sourceMeta.width,
    sourceMeta.height,
    height
  )
  const videoBitrateBps = computeBrowserTranscodeVideoBitrate(width, h, 'balanced', sourceMeta)
  const bytes = ((videoBitrateBps + BROWSER_TRANSCODE_AUDIO_BITRATE) * sourceMeta.duration) / 8
  return bytes / (1024 * 1024)
}

function formatEstimatedSize(sizeMB: number): string {
  if (sizeMB < 1024) return `${sizeMB.toFixed(1)} MB`
  return `${(sizeMB / 1024).toFixed(2)} GB`
}

function getCodecLabel(codec: ResolutionOption['suggestedCodec']): string {
  return codec === 'hevc' ? 'HEVC' : 'H.264'
}

export interface TranscodeVariantPickerProps {
  sourceMeta: TranscodeSourceMeta
  availableResolutionOptions: ResolutionOption[]
  selectedHeights: number[]
  supportsHevc: boolean
  onChange: (heights: number[]) => void
}

export function TranscodeVariantPicker({
  sourceMeta,
  availableResolutionOptions,
  selectedHeights,
  supportsHevc,
  onChange,
}: TranscodeVariantPickerProps) {
  const toggle = (height: number, checked: boolean) => {
    if (checked) {
      onChange(selectedHeights.includes(height) ? selectedHeights : [...selectedHeights, height])
    } else {
      onChange(selectedHeights.filter(h => h !== height))
    }
  }

  const getCodecForHeight = (height: number): ResolutionOption['suggestedCodec'] => {
    const forPreview = selectedHeights.includes(height)
      ? selectedHeights
      : [...selectedHeights, height]
    const withCodecs = assignMp4ResolutionCodecs(
      forPreview.map(h => ({ height: h, suggestedCodec: 'avc' as const })),
      supportsHevc
    )
    return withCodecs.find(r => r.height === height)?.suggestedCodec ?? 'avc'
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {[...availableResolutionOptions].reverse().map(opt => {
        const codec = getCodecForHeight(opt.height)
        const checked = selectedHeights.includes(opt.height)
        const sizeMB = estimateVariantSizeMB(opt.height, sourceMeta)
        const id = `variant-${opt.height}`
        return (
          <label
            key={opt.height}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 hover:bg-muted/50"
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={v => toggle(opt.height, !!v)}
            />
            <span className="flex-1 text-sm">
              <span className="block font-medium">
                {opt.height}p · {getCodecLabel(codec)}
              </span>
              <span className="block text-xs text-muted-foreground">~{formatEstimatedSize(sizeMB)}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
