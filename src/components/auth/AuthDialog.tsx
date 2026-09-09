import { useEffect, useState } from 'react'
import { KeyRound, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { useTranslation } from 'react-i18next'
import LoginDialog from './LoginDialog'
import SignupDialog from './SignupDialog'

export interface AuthDialogProps {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
}

type Step = 'choice' | 'login' | 'signup'

/**
 * Entry point for anonymous auth: leads with "Create account" / "Sign in" so
 * visitors pick their intent before seeing the full sign-in method panel.
 * Delegates to the existing LoginDialog/SignupDialog for the actual flows —
 * this only adds the choice screen in front of them.
 */
export function AuthDialog({ isOpen, onClose, onLogin }: AuthDialogProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('choice')

  // Always land back on the choice screen the next time this is opened.
  useEffect(() => {
    if (isOpen) setStep('choice')
  }, [isOpen])

  if (step === 'login') {
    return (
      <LoginDialog
        isOpen={isOpen}
        onClose={onClose}
        onLogin={onLogin}
        onSignup={() => setStep('signup')}
      />
    )
  }

  if (step === 'signup') {
    return <SignupDialog isOpen={isOpen} onClose={onClose} />
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm p-0 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-xl font-semibold text-center">
            {t('auth.entry.title', { defaultValue: 'Welcome to nostube' })}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground mt-2">
            {t('auth.entry.subtitle', { defaultValue: 'Choose how you want to continue' })}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-8 space-y-3">
          <Button
            className="w-full rounded-full py-6"
            onClick={() => setStep('signup')}
            data-testid="auth-entry-create-account"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {t('auth.entry.createAccount', { defaultValue: 'Create account' })}
          </Button>
          <Button
            variant="secondary"
            className="w-full rounded-full py-6"
            onClick={() => setStep('login')}
            data-testid="auth-entry-sign-in"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {t('auth.entry.signIn', { defaultValue: 'Sign in' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AuthDialog
