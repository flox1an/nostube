import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Label } from '@nostube/widgets/components/label'

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
