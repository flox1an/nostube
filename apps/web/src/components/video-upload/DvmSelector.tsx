import { Button } from '@/components/ui/button'
import type { TrackedDvm } from '@/lib/dvm-utils'
import { Bot, Cpu, Clock, Users } from 'lucide-react'

interface DvmSelectorProps {
  dvms: TrackedDvm[]
  selectedResolutions: string[]
  videoDurationSecs?: number
  onSelect: (dvmPubkey: string) => void
}

/**
 * Shows a list of available DVMs so the user can pick one before starting a transcode.
 * Shown when multiple DVMs are available.
 */
export function DvmSelector({
  dvms,
  selectedResolutions,
  videoDurationSecs,
  onSelect,
}: DvmSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-2">
        Select a transcoding service:
      </p>
      {dvms.map(dvm => (
        <DvmCard
          key={dvm.pubkey}
          dvm={dvm}
          selectedResolutions={selectedResolutions}
          videoDurationSecs={videoDurationSecs}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

interface DvmCardProps {
  dvm: TrackedDvm
  selectedResolutions: string[]
  videoDurationSecs?: number
  onSelect: (pubkey: string) => void
}

function DvmCard({ dvm, selectedResolutions, videoDurationSecs, onSelect }: DvmCardProps) {
  const name = dvm.name || dvm.pubkey.substring(0, 16) + '...'

  // Estimate time for the primary resolution
  const primaryRes = selectedResolutions[0]
  const etaText = estimateTime(dvm, primaryRes, videoDurationSecs)
  const priceText =
    dvm.rate === 0 ? 'Free' : dvm.rate !== undefined ? `${dvm.rate} sats/min` : undefined
  const hwText = formatHardware(dvm.hardware)
  const queueText =
    dvm.queueLength !== undefined
      ? dvm.queueLength === 0
        ? 'Queue: empty'
        : `Queue: ${dvm.queueLength} job${dvm.queueLength > 1 ? 's' : ''}`
      : undefined

  return (
    <div className="rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Bot className="h-4 w-4 mt-0.5 shrink-0 text-blue-500 dark:text-blue-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-blue-800 dark:text-blue-200 truncate">
            {name}
          </div>
          {dvm.about && (
            <div className="text-xs text-blue-600 dark:text-blue-400 line-clamp-1 mb-1">
              {dvm.about}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-blue-600 dark:text-blue-400">
            {hwText && (
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {hwText}
              </span>
            )}
            {etaText && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {etaText}
              </span>
            )}
            {queueText && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {queueText}
              </span>
            )}
            {priceText && <span>{priceText}</span>}
          </div>
        </div>
      </div>
      <Button size="sm" className="shrink-0 cursor-pointer" onClick={() => onSelect(dvm.pubkey)}>
        Select
      </Button>
    </div>
  )
}

function estimateTime(
  dvm: TrackedDvm,
  resolution: string | undefined,
  videoDurationSecs: number | undefined
): string | undefined {
  if (!resolution || !videoDurationSecs || !dvm.speeds) return undefined
  const speed = dvm.speeds[resolution]
  if (!speed || speed <= 0) return undefined
  const etaSecs = Math.ceil(videoDurationSecs / speed)
  if (etaSecs < 60) return `~${etaSecs}s for ${resolution}`
  return `~${Math.ceil(etaSecs / 60)}min for ${resolution}`
}

function formatHardware(hw: string | undefined): string | undefined {
  if (!hw) return undefined
  const map: Record<string, string> = {
    nvidia_nvenc: 'NVIDIA NVENC',
    apple_videotoolbox: 'Apple Silicon',
    vaapi: 'VAAPI',
    qsv: 'Intel QSV',
    cpu: 'CPU',
    cpu_only: 'CPU',
  }
  return map[hw.toLowerCase()] ?? hw
}
