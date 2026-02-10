import { useTranslation } from 'react-i18next'
import { useAppContext } from '@/hooks'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Monitor, Server, Database, ArrowRight, Sparkles } from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { BlossomServerTag } from '@/contexts/AppContext'

const DEFAULT_ONBOARDING_SERVERS: {
  url: string
  name: string
  tags: BlossomServerTag[]
}[] = [
  { url: 'https://blossom.primal.net', name: 'Primal', tags: ['initial upload'] },
  { url: 'https://nostr.download', name: 'nostr.download', tags: ['mirror'] },
  { url: 'https://24242.io', name: '24242.io', tags: ['mirror'] },
]

interface UploadOnboardingDialogProps {
  open: boolean
  onComplete: () => void
  onChooseOwn: () => void
  allowSkip?: boolean
  onSkip?: () => void
}

export function UploadOnboardingDialog({
  open,
  onComplete,
  onChooseOwn,
  allowSkip = false,
  onSkip,
}: UploadOnboardingDialogProps) {
  const { t } = useTranslation()
  const { updateConfig } = useAppContext()

  const handleGetStarted = () => {
    updateConfig(current => ({
      ...current,
      blossomServers: DEFAULT_ONBOARDING_SERVERS,
    }))
    onComplete()
  }

  return (
    <Dialog
      open={open}
      modal
      onOpenChange={isOpen => {
        if (!isOpen && allowSkip) onSkip?.()
      }}
    >
      <DialogContent
        className="max-w-[400px] p-6"
        hideCloseButton={!allowSkip}
        onPointerDownOutside={e => {
          if (!allowSkip) e.preventDefault()
        }}
        onEscapeKeyDown={e => {
          if (!allowSkip) e.preventDefault()
        }}
        onInteractOutside={e => {
          if (!allowSkip) e.preventDefault()
        }}
      >
        <VisuallyHidden>
          <DialogTitle>{t('upload.onboarding.getStarted')}</DialogTitle>
        </VisuallyHidden>

        {/* Visual flow: Device -> Primary -> Backups */}
        <div className="flex items-center justify-center gap-3 pt-2 pb-4">
          {/* Your Device */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Monitor className="h-6 w-6" />
            </div>
            <span className="text-xs text-muted-foreground text-center leading-tight">
              {t('upload.onboarding.yourDevice')}
            </span>
          </div>

          {/* Solid arrow */}
          <ArrowRight className="h-5 w-5 text-muted-foreground/60 shrink-0 mt-[-1.25rem]" />

          {/* Primary Server */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
              <Server className="h-6 w-6" />
            </div>
            <span className="text-xs text-muted-foreground text-center leading-tight">
              {t('upload.onboarding.primaryServer')}
            </span>
          </div>

          {/* Dashed arrow with sparkle */}
          <div className="flex items-center shrink-0 mt-[-1.25rem]">
            <div className="w-4 border-t-2 border-dashed border-muted-foreground/40" />
            <Sparkles className="h-3.5 w-3.5 text-amber-500 -mx-0.5" />
            <div className="w-4 border-t-2 border-dashed border-muted-foreground/40" />
          </div>

          {/* Backup Servers */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
              <Database className="h-6 w-6" />
            </div>
            <span className="text-xs text-muted-foreground text-center leading-tight">
              {t('upload.onboarding.backupServers')}
            </span>
          </div>
        </div>

        {/* Explanation text */}
        <p className="text-sm text-muted-foreground leading-relaxed text-center">
          {t('upload.onboarding.explanation')}
        </p>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <Button type="button" className="w-full cursor-pointer" onClick={handleGetStarted}>
            {t('upload.onboarding.getStarted')}
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer underline underline-offset-2"
            onClick={onChooseOwn}
          >
            {t('upload.onboarding.chooseOwn')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
