import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface OnboardingStepInfo {
  id: string
  label: string
}

interface OnboardingShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Steps shown on the progress rail; future flows may pass more steps. */
  steps: OnboardingStepInfo[]
  currentStepIndex: number
  /** Optional full-bleed banner (e.g. welcome hero on the first step). */
  hero?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Shared dialog shell for all onboarding flows. Provides consistent chrome,
 * an optional hero banner, an accurate discrete progress rail, and a single
 * content slot. Replaces the four divergent dialog containers that made
 * onboarding feel fragmented.
 */
export function OnboardingShell({
  open,
  onOpenChange,
  title,
  description,
  steps,
  currentStepIndex,
  hero,
  children,
  className,
}: OnboardingShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className={cn('max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl', className)}
      >
        <div className="flex max-h-[90vh] flex-col">
          {hero && (
            <div className="relative h-32 w-full shrink-0 overflow-hidden sm:h-40">
              {hero}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-xl">{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            <ProgressRail steps={steps} currentIndex={currentStepIndex} />
            <div className="mt-5">{children}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Discrete stepper. Replaces the old single progress bar that miscounted
 * skippable steps as completed work.
 */
function ProgressRail({
  steps,
  currentIndex,
}: {
  steps: OnboardingStepInfo[]
  currentIndex: number
}) {
  return (
    <ol className="mt-5 flex items-start">
      {steps.map((step, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex
        return (
          <li key={step.id} className={cn('flex items-start', i < steps.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  isDone && 'border-primary bg-primary text-primary-foreground',
                  isCurrent && 'border-primary text-primary',
                  !isDone && !isCurrent && 'border-muted-foreground/25 text-muted-foreground/50'
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  'max-w-[5rem] text-center text-[10px] leading-tight transition-colors',
                  isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground/60'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                className={cn(
                  'mx-1.5 mt-3.5 h-px flex-1 transition-colors',
                  i < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20'
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
