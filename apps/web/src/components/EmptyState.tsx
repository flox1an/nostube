import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: ReactNode
  description: ReactNode
  /** h1 when the state is the whole page (guest library/upload), h2 under a page title. */
  heading?: 'h1' | 'h2'
  /** Extra content and actions: one primary Button, optionally a secondary link-variant one. */
  children: ReactNode
}

/**
 * Shared anatomy for "nothing here yet / please sign in" states: 16px side inset and 24px
 * above on phones, centred title, short hint, then actions.
 */
export function EmptyState({
  title,
  description,
  heading: Heading = 'h2',
  children,
}: EmptyStateProps) {
  return (
    <div className="mx-4 mt-6 space-y-4 rounded-xl border px-6 py-8 text-center sm:m-0">
      <div className="space-y-2">
        <Heading className={Heading === 'h1' ? 'text-2xl font-semibold' : 'text-lg font-semibold'}>
          {title}
        </Heading>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center gap-3">{children}</div>
    </div>
  )
}
