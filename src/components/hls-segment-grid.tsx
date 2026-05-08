import { cn } from '@/lib/utils'

export type SegmentStatus =
  | 'pending'
  | 'uploading'
  | 'mirroring'
  | 'checking'
  | 'done'
  | 'available'
  | 'error'
  | 'unavailable'

export interface SegmentGridStream {
  label: string
  statuses: SegmentStatus[]
}

interface HlsSegmentGridProps {
  streams: SegmentGridStream[]
  className?: string
}

function segmentColor(status: SegmentStatus): string {
  switch (status) {
    case 'done':
    case 'available':
      return 'bg-green-500'
    case 'uploading':
    case 'mirroring':
      return 'bg-blue-400 animate-pulse'
    case 'checking':
      return 'bg-yellow-400 animate-pulse'
    case 'error':
    case 'unavailable':
      return 'bg-red-500'
    case 'pending':
    default:
      return 'bg-muted-foreground/25'
  }
}

function segmentLabel(status: SegmentStatus): string {
  switch (status) {
    case 'done':
      return 'Uploaded'
    case 'available':
      return 'Available'
    case 'uploading':
      return 'Uploading'
    case 'mirroring':
      return 'Mirroring'
    case 'checking':
      return 'Checking'
    case 'error':
      return 'Error'
    case 'unavailable':
      return 'Unavailable'
    case 'pending':
    default:
      return 'Pending'
  }
}

export function HlsSegmentGrid({ streams, className }: HlsSegmentGridProps) {
  if (streams.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      {streams.map(stream => {
        const done = stream.statuses.filter(s => s === 'done' || s === 'available').length
        const total = stream.statuses.length
        return (
          <div key={stream.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{stream.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {done}/{total}
              </span>
            </div>
            <div className="flex flex-wrap gap-[2px]">
              {stream.statuses.map((status, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-3 w-[6px] rounded-[2px] transition-colors duration-300',
                    segmentColor(status)
                  )}
                  title={`Segment ${i + 1}: ${segmentLabel(status)}`}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
