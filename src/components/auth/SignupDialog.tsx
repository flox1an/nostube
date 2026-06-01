// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useState } from 'react'
import { Key } from 'lucide-react'
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
import { SeedBackupStep } from '@/components/onboarding/SeedBackupStep'

interface SignupDialogProps {
  isOpen: boolean
  onClose: () => void
}

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

const SignupDialog: React.FC<SignupDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<'generate' | 'backup' | 'done'>('generate')
  const [isLoading, setIsLoading] = useState(false)
  const [nsec, setNsec] = useState('')
  const login = useLoginActions()

  const generateKey = () => {
    setIsLoading(true)

    try {
      const sk = generateSecretKey()
      setNsec(nip19.nsecEncode(sk))
      setStep('backup')
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

  const finishSignup = async (password?: string) => {
    setIsLoading(true)
    try {
      if (password) {
        await encryptAndStoreNsec(nsec, password)
      }
      await login.nsec(nsec)
      localStorage.setItem('nostube_onboarding_new_user', '1')
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
            {step === 'backup' && t('auth.signup.downloadTitle')}
            {step === 'done' && t('auth.signup.settingUpTitle')}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground mt-2">
            {step === 'generate' && t('auth.signup.generateDescription')}
            {step === 'backup' && t('auth.signup.keepSafeDescription')}
            {step === 'done' && t('auth.signup.finalizingDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8 space-y-6">
          {step === 'generate' && (
            <div className="text-center space-y-6">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                <Key className="w-16 h-16 text-primary" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{t('auth.signup.introText')}</p>
              <Button
                className="w-full rounded-full py-6"
                onClick={generateKey}
                disabled={isLoading}
              >
                {isLoading ? t('auth.signup.generating') : t('auth.signup.generateButton')}
              </Button>
            </div>
          )}

          {step === 'backup' && (
            <SeedBackupStep
              nsec={nsec}
              onConfirmed={password => finishSignup(password)}
              onBack={() => setStep('generate')}
            />
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
