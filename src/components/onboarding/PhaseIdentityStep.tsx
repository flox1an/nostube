import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { QRCodeLogin } from '@/components/auth/QRCodeLogin'
import { SeedBackupStep } from './SeedBackupStep'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useLoginActions } from '@/hooks/useLoginActions'
import { isNip05 } from '@/lib/nip05-bunker'
import { generateSecretKey, nip19 } from 'nostr-tools'
import { AlertCircle, KeyRound, Sparkles, Shield } from 'lucide-react'
import { isNcryptsec } from '@/lib/nip49'

interface PhaseIdentityStepProps {
  onComplete: () => void
}

type Mode = 'choose' | 'login' | 'backup'

export function PhaseIdentityStep({ onComplete }: PhaseIdentityStepProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const login = useLoginActions()
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyPassword, setKeyPassword] = useState('')
  const [bunkerUri, setBunkerUri] = useState('')
  const [generatedNsec, setGeneratedNsec] = useState('')
  const isEncryptedKey = isNcryptsec(keyInput)

  if (user?.pubkey) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('onboarding.identityStep.title')}</h3>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('onboarding.identityStep.loggedInAs')}</CardTitle>
            <CardDescription className="font-mono text-xs break-all">{user.pubkey}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onComplete}>{t('onboarding.identityStep.continue')}</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleExtensionLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await login.extension()
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyLogin = async () => {
    const trimmedKey = keyInput.trim()
    if (!trimmedKey) {
      setError('Enter an ncryptsec or nsec key')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      if (isNcryptsec(trimmedKey)) {
        await login.ncryptsec(trimmedKey, keyPassword)
      } else {
        await login.nsec(trimmedKey)
      }
      setKeyInput('')
      setKeyPassword('')
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim() || (!bunkerUri.startsWith('bunker://') && !isNip05(bunkerUri.trim()))) {
      setError('Enter a bunker:// URI or NIP-05 address (user@domain)')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      await login.bunker(bunkerUri)
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const startSignup = () => {
    const sk = generateSecretKey()
    setGeneratedNsec(nip19.nsecEncode(sk))
    setMode('backup')
  }

  const handleConfirmSeed = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await login.nsec(generatedNsec)
      localStorage.setItem('nostube_onboarding_new_user', '1')
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setIsLoading(false)
    }
  }

  if (mode === 'backup') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('onboarding.identityStep.newUser')}</h3>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <SeedBackupStep
          nsec={generatedNsec}
          onConfirmed={handleConfirmSeed}
          onBack={() => setMode('choose')}
        />
        {isLoading && (
          <p className="text-sm text-muted-foreground">{t('auth.signup.finalizingDescription')}</p>
        )}
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('onboarding.identityStep.title')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="cursor-pointer hover:bg-accent/40" onClick={() => setMode('login')}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                {t('onboarding.identityStep.hasKey')}
              </CardTitle>
              <CardDescription>{t('onboarding.identityStep.hasKeyDescription')}</CardDescription>
            </CardHeader>
          </Card>
          <Card className="cursor-pointer hover:bg-accent/40" onClick={startSignup}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t('onboarding.identityStep.newUser')}
              </CardTitle>
              <CardDescription>{t('onboarding.identityStep.newUserDescription')}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('onboarding.identityStep.hasKey')}</h3>
        <Button variant="ghost" size="sm" onClick={() => setMode('choose')}>
          {t('common.back')}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="qr" className="w-full">
        <TabsList className="grid h-auto grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="qr">QR</TabsTrigger>
          <TabsTrigger value="extension">{t('auth.login.extension')}</TabsTrigger>
          <TabsTrigger value="key">{t('auth.login.protectedKey', 'Key')}</TabsTrigger>
          <TabsTrigger value="bunker">{t('auth.login.bunker')}</TabsTrigger>
        </TabsList>

        <TabsContent value="qr" className="pt-4">
          <QRCodeLogin onLogin={onComplete} onError={setError} />
        </TabsContent>
        <TabsContent value="extension" className="pt-4">
          <Button onClick={handleExtensionLogin} disabled={isLoading} className="w-full">
            <Shield className="h-4 w-4 mr-2" />
            {t('auth.login.loginWithExtension')}
          </Button>
        </TabsContent>
        <TabsContent value="key" className="pt-4 space-y-2">
          <Input
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder={t('auth.login.keyPlaceholder', 'ncryptsec1... or nsec1...')}
          />
          {isEncryptedKey && (
            <Input
              type="password"
              value={keyPassword}
              onChange={e => setKeyPassword(e.target.value)}
              placeholder={t('auth.login.protectedKeyPassword', 'Backup password')}
            />
          )}
          <Button
            onClick={handleKeyLogin}
            disabled={isLoading || !keyInput.trim() || (isEncryptedKey && !keyPassword)}
            className="w-full"
          >
            <Shield className="h-4 w-4 mr-2" />
            {t('auth.login.loginWithProtectedKey', 'Continue with key')}
          </Button>
        </TabsContent>
        <TabsContent value="bunker" className="pt-4 space-y-2">
          <Input
            value={bunkerUri}
            onChange={e => setBunkerUri(e.target.value)}
            placeholder={t('auth.login.bunkerPlaceholder')}
          />
          <Button
            onClick={handleBunkerLogin}
            disabled={isLoading || !bunkerUri.trim()}
            className="w-full"
          >
            {t('auth.login.loginWithBunker')}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
