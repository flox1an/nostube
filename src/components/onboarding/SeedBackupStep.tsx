import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download, Key, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface SeedBackupStepProps {
  nsec: string
  onConfirmed: (password?: string) => void
  onBack?: () => void
}

export function SeedBackupStep({ nsec, onConfirmed, onBack }: SeedBackupStepProps) {
  const { t } = useTranslation()
  const [hasDownloaded, setHasDownloaded] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [showPasswordField, setShowPasswordField] = useState(false)

  const downloadKey = () => {
    const blob = new Blob([nsec], { type: 'text/plain' })
    const url = globalThis.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nostube-nsec.txt'
    document.body.appendChild(a)
    a.click()
    globalThis.URL.revokeObjectURL(url)
    document.body.removeChild(a)
    setHasDownloaded(true)
  }

  const canProceed = hasDownloaded && backupConfirmed

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Key className="h-4 w-4" />
          <span>{t('onboarding.seedBackup.yourKey')}</span>
        </div>
        <div className="p-4 rounded-lg border bg-muted/30 overflow-auto">
          <code className="text-xs break-all select-all font-mono">{nsec}</code>
        </div>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <p className="font-medium">{t('onboarding.seedBackup.important')}</p>
          <ul className="list-disc pl-4 space-y-0.5 text-amber-700 dark:text-amber-300">
            <li>{t('onboarding.seedBackup.warning1')}</li>
            <li>{t('onboarding.seedBackup.warning2')}</li>
            <li>{t('onboarding.seedBackup.warning3')}</li>
          </ul>
        </div>
      </div>

      <Button
        variant={hasDownloaded ? 'outline' : 'default'}
        className="w-full"
        onClick={downloadKey}
      >
        <Download className="h-4 w-4 mr-2" />
        {hasDownloaded
          ? t('onboarding.seedBackup.downloadAgain')
          : t('onboarding.seedBackup.downloadKey')}
      </Button>

      {hasDownloaded && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>{t('onboarding.seedBackup.downloaded')}</span>
        </div>
      )}

      <div className="flex items-start gap-3 p-3 rounded-lg border">
        <Checkbox
          id="backup-confirmed"
          checked={backupConfirmed}
          onCheckedChange={checked => setBackupConfirmed(checked === true)}
          disabled={!hasDownloaded}
        />
        <Label htmlFor="backup-confirmed" className="text-sm leading-relaxed cursor-pointer">
          {t('onboarding.seedBackup.confirmBackup')}
        </Label>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowPasswordField(!showPasswordField)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield className="h-4 w-4" />
          <span>{t('onboarding.seedBackup.passwordProtect')}</span>
        </button>
        {showPasswordField && (
          <div className="space-y-2 pl-6">
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('onboarding.seedBackup.passwordPlaceholder')}
              className="max-w-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('onboarding.seedBackup.passwordHint')}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="flex-1">
            {t('common.back')}
          </Button>
        )}
        <Button
          onClick={() => onConfirmed(password || undefined)}
          disabled={!canProceed}
          className="flex-1"
        >
          {t('onboarding.seedBackup.continue')}
        </Button>
      </div>
    </div>
  )
}
