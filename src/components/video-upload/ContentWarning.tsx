import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

interface ContentWarningProps {
  enabled: boolean
  reason: string
  onEnabledChange: (enabled: boolean) => void
  onReasonChange: (reason: string) => void
}

export function ContentWarning({
  enabled,
  reason,
  onEnabledChange,
  onReasonChange,
}: ContentWarningProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id="content-warning"
          defaultChecked={false}
          required={false}
          checked={enabled}
          onCheckedChange={e => onEnabledChange(e as boolean)}
        />
        <Label htmlFor="content-warning">Mark as NSFW / add content warning</Label>
      </div>
      {enabled && (
        <div className="flex flex-col gap-1 mt-2">
          <Label htmlFor="content-warning-reason">Reason (optional)</Label>
          <Input
            id="content-warning-reason"
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
            placeholder="e.g. nudity, violence, etc."
          />
        </div>
      )}
    </div>
  )
}
