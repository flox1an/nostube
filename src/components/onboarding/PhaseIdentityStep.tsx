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
import { AlertCircle, KeyRound, Sparkles, Shield, User } from 'lucide-react'

interface PhaseIdentityStepProps {
  onComplete: () => void
}

type Mode = 'choose' | 'login' | 'backup'

async function encryptAndStoreNsec(nsec: string, password: string) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(nsec))

  localStorage.setItem(
    'nostube:encrypted-nsec',
    JSON.stringify({
      version: 1,
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2',
      iterations: 250000,
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    })
  )
}

export function PhaseIdentityStep({ onComplete }: PhaseIdentityStepProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const login = useLoginActions()
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [nsec, setNsec] = useState('')
  const [bunkerUri, setBunkerUri] = useState('')
  const [generatedNsec, setGeneratedNsec] = useState('')

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

  const handleNsecLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await login.nsec(nsec)
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

  const handleConfirmSeed = async (password?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      if (password) await encryptAndStoreNsec(generatedNsec, password)
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
        <SeedBackupStep nsec={generatedNsec} onConfirmed={handleConfirmSeed} onBack={() => setMode('choose')} />
        {isLoading && <p className="text-sm text-muted-foreground">{t('auth.signup.finalizingDescription')}</p>}
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
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="qr">QR</TabsTrigger>
          <TabsTrigger value="extension">{t('auth.login.extension')}</TabsTrigger>
          <TabsTrigger value="nsec">{t('auth.login.nsec')}</TabsTrigger>
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
        <TabsContent value="nsec" className="pt-4 space-y-2">
          <Input value={nsec} onChange={e => setNsec(e.target.value)} placeholder="nsec1..." />
          <Button onClick={handleNsecLogin} disabled={isLoading || !nsec.trim()} className="w-full">
            <User className="h-4 w-4 mr-2" />
            {t('auth.login.loginWithNsec')}
          </Button>
        </TabsContent>
        <TabsContent value="bunker" className="pt-4 space-y-2">
          <Input
            value={bunkerUri}
            onChange={e => setBunkerUri(e.target.value)}
            placeholder={t('auth.login.bunkerPlaceholder')}
          />
          <Button onClick={handleBunkerLogin} disabled={isLoading || !bunkerUri.trim()} className="w-full">
            {t('auth.login.loginWithBunker')}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}
