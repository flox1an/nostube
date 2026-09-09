// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react'
import { User } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { AuthDialog } from './AuthDialog'
import { AccountSwitcher } from './AccountSwitcher'
import { cn } from '@/lib/utils'
import { useActiveAccount } from 'applesauce-react/hooks'
import { useTranslation } from 'react-i18next'

import { useDesktopWindowCoordinator } from '@/desktop/useDesktopWindowCoordinator'
export interface LoginAreaProps {
  className?: string
}

export function LoginArea({ className }: LoginAreaProps) {
  const { t } = useTranslation()
  const currentUser = useActiveAccount()
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const desktopWindowCoordinator = useDesktopWindowCoordinator()

  const openLogin = () => {
    if (desktopWindowCoordinator) {
      void desktopWindowCoordinator.openAuth()
      return
    }
    setAuthDialogOpen(true)
  }

  const handleLogin = () => {
    setAuthDialogOpen(false)
  }

  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      {currentUser ? (
        <AccountSwitcher onAddAccount={openLogin} />
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={openLogin}
          aria-label={t('auth.login.signIn', { defaultValue: 'Sign in' })}
        >
          <User className="w-5 h-5" />
        </Button>
      )}

      <AuthDialog
        isOpen={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
        onLogin={handleLogin}
      />
    </div>
  )
}
