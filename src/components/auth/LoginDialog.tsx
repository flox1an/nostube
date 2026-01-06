// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState } from 'react'
import { Shield, Upload, AlertCircle, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { useLoginActions } from '@/hooks/useLoginActions'
import { useTranslation } from 'react-i18next'
import { QRCodeLogin } from './QRCodeLogin'

interface LoginDialogProps {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
  onSignup?: () => void
}

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin, onSignup }) => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nsec, setNsec] = useState('')
  const [bunkerUri, setBunkerUri] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const login = useLoginActions()

  const handleExtensionLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      await login.extension()
      onLogin()
      onClose()
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Extension login failed. Please try again.'
      setError(errorMessage)
      console.error('Extension login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyLogin = async () => {
    if (!nsec.trim()) {
      setError('Please enter your nsec key')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await login.nsec(nsec)
      setNsec('') // Clear nsec after successful login
      onLogin()
      onClose()
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Nsec login failed. Please check your key and try again.'
      setError(errorMessage)
      console.error('Nsec login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setError('Please enter a bunker URI')
      return
    }

    if (!bunkerUri.startsWith('bunker://')) {
      setError('Bunker URI must start with bunker://')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await login.bunker(bunkerUri)
      setBunkerUri('') // Clear bunker URI after successful login
      onLogin()
      onClose()
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Bunker login failed. Please check your URI and try again.'
      setError(errorMessage)
      console.error('Bunker login failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = event => {
      const content = event.target?.result as string
      setNsec(content.trim())
    }
    reader.readAsText(file)
  }

  const handleSignupClick = () => {
    onClose()
    if (onSignup) {
      onSignup()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-0 relative">
          <DialogTitle className="text-xl font-semibold text-center">
            {t('auth.login.title')}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground mt-2">
            {t('auth.login.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="qr" className="w-full" onValueChange={() => setError(null)}>
            <TabsList className="grid grid-cols-4 mb-6">
              <TabsTrigger value="qr">
                <QrCode className="w-4 h-4 mr-1" />
                {t('auth.login.qr', 'QR')}
              </TabsTrigger>
              <TabsTrigger value="extension">{t('auth.login.extension')}</TabsTrigger>
              <TabsTrigger value="key">{t('auth.login.nsec')}</TabsTrigger>
              <TabsTrigger value="bunker">{t('auth.login.bunker')}</TabsTrigger>
            </TabsList>

            <TabsContent value="qr" className="space-y-4">
              <QRCodeLogin
                onLogin={() => {
                  onLogin()
                  onClose()
                }}
                onError={setError}
              />
            </TabsContent>

            <TabsContent value="extension" className="space-y-4">
              <div className="text-center p-4 rounded-lg bg-card">
                <Shield className="w-12 h-12 mx-auto mb-3 text-primary" />
                <p className="text-sm mb-4">{t('auth.login.extensionDescription')}</p>
                <Button
                  className="w-full rounded-full py-6"
                  onClick={handleExtensionLogin}
                  disabled={isLoading}
                >
                  {isLoading ? t('auth.login.loggingIn') : t('auth.login.loginWithExtension')}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="key" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="nsec"
                    className="text-sm font-medium text-gray-700 dark:text-gray-400"
                  >
                    {t('auth.login.enterNsec')}
                  </label>
                  <Input
                    id="nsec"
                    value={nsec}
                    onChange={e => setNsec(e.target.value)}
                    className="rounded-lg focus-visible:ring-primary"
                    placeholder={t('auth.login.nsecPlaceholder')}
                  />
                </div>

                <div className="text-center">
                  <p className="text-sm mb-2">{t('auth.login.uploadKeyFile')}</p>
                  <input
                    type="file"
                    accept=".txt"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {t('auth.login.uploadNsecFile')}
                  </Button>
                </div>

                <Button
                  className="w-full rounded-full py-6 mt-4"
                  onClick={handleKeyLogin}
                  disabled={isLoading || !nsec.trim()}
                >
                  {isLoading ? t('auth.login.verifying') : t('auth.login.loginWithNsec')}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="bunker" className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="bunkerUri"
                  className="text-sm font-medium text-gray-700 dark:text-gray-400"
                >
                  {t('auth.login.bunkerUri')}
                </label>
                <Input
                  id="bunkerUri"
                  value={bunkerUri}
                  onChange={e => setBunkerUri(e.target.value)}
                  className="rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary"
                  placeholder={t('auth.login.bunkerPlaceholder')}
                />
                {bunkerUri && !bunkerUri.startsWith('bunker://') && (
                  <p className="text-red-500 text-xs">{t('auth.login.bunkerUriError')}</p>
                )}
              </div>

              <Button
                className="w-full rounded-full py-6"
                onClick={handleBunkerLogin}
                disabled={isLoading || !bunkerUri.trim() || !bunkerUri.startsWith('bunker://')}
              >
                {isLoading ? t('auth.login.connecting') : t('auth.login.loginWithBunker')}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="text-center text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              {t('auth.login.noAccount')}{' '}
              <button
                onClick={handleSignupClick}
                className="text-primary hover:underline font-medium"
              >
                {t('auth.login.signUp')}
              </button>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default LoginDialog
