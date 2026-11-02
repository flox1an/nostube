import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Label } from '@nostube/widgets/components/label'
import { Switch } from '@nostube/widgets/components/switch'

/** A labelled form field with an optional hint line. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * A feature with its own switch: its settings show only while it is on. `note` says why the
 * switch is locked, or anything the owner must know while the feature is off.
 */
export function FeatureCard({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  note,
  children,
}: {
  title: string
  description: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  note?: ReactNode
  children?: ReactNode
}) {
  const id = useId()
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle id={`${id}-title`}>{title}</CardTitle>
          <CardDescription id={`${id}-description`}>{description}</CardDescription>
        </div>
        <Switch
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="mt-1"
        />
      </CardHeader>
      {(note || (checked && children)) && (
        <CardContent className="space-y-4">
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
          {checked && children}
        </CardContent>
      )}
    </Card>
  )
}

/** A choice that fills its column; `selected` marks the one taken. */
export function Tile({
  title,
  icon: Icon,
  selected,
  onSelect,
  disabled,
  children,
}: {
  title: string
  icon: LucideIcon
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`space-y-2 rounded-md border p-4 text-left text-sm transition-colors disabled:opacity-50 ${
        selected ? 'border-primary ring-2 ring-primary' : 'border-border hover:bg-muted'
      }`}
    >
      <span className="flex items-start gap-3 text-base font-medium">
        <Icon
          aria-hidden="true"
          className={`mt-0.5 size-5 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`}
        />
        <span>{title}</span>
      </span>
      {children}
    </button>
  )
}
