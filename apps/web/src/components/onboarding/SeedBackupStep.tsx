import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download, Key, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  encryptNsecToNcryptsec,
  NIP49_RAW_KEY_CONFIRMATION,
  type Nip49KeySecurity,
} from '@/lib/nip49'

interface SeedBackupStepProps {
  nsec: string
  onConfirmed: () => void
  onBack?: () => void
  keySecurity?: Nip49KeySecurity
}

export function SeedBackupStep({
  nsec,
  onConfirmed,
  onBack,
  keySecurity = 'secure',
}: SeedBackupStepProps) {
  const { t } = useTranslation()
  const [hasDownloaded, setHasDownloaded] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isEncrypting, setIsEncrypting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [rawConfirmation, setRawConfirmation] = useState('')
  const [showRawKey, setShowRawKey] = useState(false)

  const passwordReady = password.length >= 8 && password === confirmPassword
  const rawKeyUnlocked = rawConfirmation.trim() === NIP49_RAW_KEY_CONFIRMATION

  const downloadText = (contents: string, filename: string) => {
    const blob = new Blob([contents], { type: 'text/plain' })
    const url = globalThis.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    globalThis.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const downloadEncryptedKey = async () => {
    if (!passwordReady) return

    setIsEncrypting(true)
    setError(null)
    try {
      const ncryptsec = await encryptNsecToNcryptsec(nsec, password, { keySecurity })
      downloadText(ncryptsec, 'nostube-ncryptsec.txt')
      setHasDownloaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create encrypted backup')
    } finally {
      setIsEncrypting(false)
    }
  }

  const downloadRawKey = () => {
    if (!rawKeyUnlocked) return
    downloadText(nsec, 'nostube-raw-nsec.txt')
    setHasDownloaded(true)
  }

  const canProceed = hasDownloaded && backupConfirmed

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>{t('onboarding.seedBackup.protectedTitle')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('onboarding.seedBackup.protectedDescription')}
        </p>
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

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="backup-password">{t('onboarding.seedBackup.passwordLabel')}</Label>
          <Input
            id="backup-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('onboarding.seedBackup.passwordPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="backup-password-confirm">
            {t('onboarding.seedBackup.confirmPasswordLabel')}
          </Label>
          <Input
            id="backup-password-confirm"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder={t('onboarding.seedBackup.confirmPasswordPlaceholder')}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('onboarding.seedBackup.passwordHint')}</p>
      </div>

      <Button
        variant={hasDownloaded ? 'outline' : 'default'}
        className="w-full"
        onClick={downloadEncryptedKey}
        disabled={!passwordReady || isEncrypting}
      >
        <Download className="h-4 w-4 mr-2" />
        {isEncrypting
          ? t('onboarding.seedBackup.encrypting')
          : hasDownloaded
            ? t('onboarding.seedBackup.downloadAgain')
            : t('onboarding.seedBackup.downloadProtectedKey')}
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
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Key className="h-4 w-4" />
          <span>{t('onboarding.seedBackup.rawKeyAdvanced')}</span>
        </button>
        {showAdvanced && (
          <div className="space-y-3 pl-6">
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
              {t('onboarding.seedBackup.rawKeyWarning')}
            </div>
            <Input
              value={rawConfirmation}
              onChange={e => {
                setRawConfirmation(e.target.value)
                setShowRawKey(false)
              }}
              placeholder={t('onboarding.seedBackup.rawKeyConfirmationPlaceholder', {
                phrase: NIP49_RAW_KEY_CONFIRMATION,
              })}
            />
            {rawKeyUnlocked && (
              <div className="space-y-2">
                {showRawKey && (
                  <div className="p-4 rounded-lg border bg-muted/30 overflow-auto">
                    <code className="text-xs break-all select-all font-mono">{nsec}</code>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowRawKey(value => !value)}
                  >
                    {showRawKey
                      ? t('onboarding.seedBackup.hideRawKey')
                      : t('onboarding.seedBackup.showRawKey')}
                  </Button>
                  <Button type="button" variant="secondary" onClick={downloadRawKey}>
                    <Download className="h-4 w-4 mr-2" />
                    {t('onboarding.seedBackup.downloadRawKey')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="flex-1">
            {t('common.back')}
          </Button>
        )}
        <Button onClick={onConfirmed} disabled={!canProceed} className="flex-1">
          {t('onboarding.seedBackup.continue')}
        </Button>
      </div>
    </div>
  )
}
