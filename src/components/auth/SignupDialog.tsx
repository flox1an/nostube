// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useState } from 'react'
import { Download, Key } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { toast, useLoginActions } from '@/hooks'
import { generateSecretKey, nip19 } from 'nostr-tools'
import { useTranslation } from 'react-i18next'

interface SignupDialogProps {
  isOpen: boolean
  onClose: () => void
}

const SignupDialog: React.FC<SignupDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<'generate' | 'download' | 'done'>('generate')
  const [isLoading, setIsLoading] = useState(false)
  const [nsec, setNsec] = useState('')
  const login = useLoginActions()

  // Generate a proper nsec key using nostr-tools
  const generateKey = () => {
    setIsLoading(true)

    try {
      // Generate a new secret key
      const sk = generateSecretKey()

      // Convert to nsec format
      setNsec(nip19.nsecEncode(sk))
      setStep('download')
    } catch (error) {
      console.error('Failed to generate key:', error)
      toast({
        title: t('auth.signup.errorTitle'),
        description: t('auth.signup.errorMessage'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const downloadKey = () => {
    // Create a blob with the key text
    const blob = new Blob([nsec], { type: 'text/plain' })
    const url = globalThis.URL.createObjectURL(blob)

    // Create a temporary link element and trigger download
    const a = document.createElement('a')
    a.href = url
    a.download = 'nsec.txt'
    document.body.appendChild(a)
    a.click()

    // Clean up
    globalThis.URL.revokeObjectURL(url)
    document.body.removeChild(a)

    toast({
      title: t('auth.signup.keyDownloaded'),
      description: t('auth.signup.keyDownloadedMessage'),
    })
  }

  const finishSignup = async () => {
    setIsLoading(true)
    try {
      await login.nsec(nsec)
      setStep('done')
      onClose()

      toast({
        title: t('auth.signup.accountCreated'),
        description: t('auth.signup.accountCreatedMessage'),
      })
    } catch (error) {
      toast({
        title: t('auth.signup.errorTitle'),
        description: error instanceof Error ? error.message : t('auth.signup.errorMessage'),
        variant: 'destructive',
      })
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-0 relative">
          <DialogTitle className="text-xl font-semibold text-center">
            {step === 'generate' && t('auth.signup.title')}
            {step === 'download' && t('auth.signup.downloadTitle')}
            {step === 'done' && t('auth.signup.settingUpTitle')}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground mt-2">
            {step === 'generate' && t('auth.signup.generateDescription')}
            {step === 'download' && t('auth.signup.keepSafeDescription')}
            {step === 'done' && t('auth.signup.finalizingDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8 space-y-6">
          {step === 'generate' && (
            <div className="text-center space-y-6">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                <Key className="w-16 h-16 text-primary" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t('auth.signup.introText')}
              </p>
              <Button
                className="w-full rounded-full py-6"
                onClick={generateKey}
                disabled={isLoading}
              >
                {isLoading ? t('auth.signup.generating') : t('auth.signup.generateButton')}
              </Button>
            </div>
          )}

          {step === 'download' && (
            <div className="space-y-6">
              <div className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-800 overflow-auto">
                <code className="text-xs break-all">{nsec}</code>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                <p className="font-medium text-red-500">{t('auth.signup.important')}</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>{t('auth.signup.importantItem1')}</li>
                  <li>{t('auth.signup.importantItem2')}</li>
                  <li>{t('auth.signup.importantItem3')}</li>
                </ul>
              </div>

              <div className="flex flex-col space-y-3">
                <Button variant="outline" className="w-full" onClick={downloadKey}>
                  <Download className="w-4 h-4 mr-2" />
                  {t('auth.signup.downloadKey')}
                </Button>

                <Button className="w-full rounded-full py-6" onClick={finishSignup}>
                  {t('auth.signup.savedKey')}
                </Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SignupDialog
