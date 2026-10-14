import { Download, Share, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog'
import { useInstallState } from '../hooks/useInstallState'
import {
  dismissInstallBanner,
  getInstallMode,
  promptInstall,
  shouldShowInstallBanner,
} from '../install-prompt'

/** In-flow strip below the header: never overlaps the bottom nav or a player. */
export function InstallBanner() {
  const { t } = useTranslation()
  const state = useInstallState()
  if (!shouldShowInstallBanner(state)) return null
  const mode = getInstallMode(state)

  return (
    <div
      role="region"
      aria-label={t('install.title')}
      className="flex items-center gap-3 border-b border-border bg-muted/50 py-2 text-sm animate-in slide-in-from-top duration-300"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">
        {mode === 'ios' ? t('install.iosHint') : t('install.bannerText')}
      </span>
      {mode === 'prompt' && (
        <Button size="sm" onClick={() => void promptInstall()}>
          {t('install.install')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        aria-label={t('install.dismiss')}
        onClick={dismissInstallBanner}
      >
        <X />
      </Button>
    </div>
  )
}

/** iOS has no install prompt: explain Share → "Add to Home Screen". */
export function IosInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('install.iosDialogTitle')}</DialogTitle>
          <DialogDescription>{t('install.settingsDescription')}</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            {t('install.iosStep1')} <Share className="inline h-4 w-4 align-text-bottom" />
          </li>
          <li>{t('install.iosStep2')}</li>
          <li>{t('install.iosStep3')}</li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}
