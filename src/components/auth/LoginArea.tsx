// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react'
import { User } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { AuthDialog } from './AuthDialog'
import { AccountSwitcher } from './AccountSwitcher'
import { cn } from '@/lib/utils'
import { useActiveAccount } from 'applesauce-react/hooks'

import { useDesktopWindowCoordinator } from '@/desktop/useDesktopWindowCoordinator'
export interface LoginAreaProps {
  className?: string
}

export function LoginArea({ className }: LoginAreaProps) {
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
        <Button onClick={openLogin}>
          <User className="w-4 h-4" />
          <span className="truncate">Log in</span>
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
