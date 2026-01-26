// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useState } from 'react'
import { User } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import LoginDialog from './LoginDialog'
import SignupDialog from './SignupDialog'
import { AccountSwitcher } from './AccountSwitcher'
import { cn } from '@/lib/utils'
import { useActiveAccount } from 'applesauce-react/hooks'

export interface LoginAreaProps {
  className?: string
}

export function LoginArea({ className }: LoginAreaProps) {
  const currentUser = useActiveAccount()
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [signupDialogOpen, setSignupDialogOpen] = useState(false)

  const handleLogin = () => {
    setLoginDialogOpen(false)
    setSignupDialogOpen(false)
  }

  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      {currentUser ? (
        <AccountSwitcher />
      ) : (
        <Button onClick={() => setLoginDialogOpen(true)} variant={'outline'}>
          <User className="w-4 h-4" />
          <span className="truncate">Log in</span>
        </Button>
      )}

      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignup={() => setSignupDialogOpen(true)}
      />

      <SignupDialog isOpen={signupDialogOpen} onClose={() => setSignupDialogOpen(false)} />
    </div>
  )
}
