import { useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { useActiveAccount } from 'applesauce-react/hooks'
import { useLoginActions } from '@nostube/widgets/hooks/useLoginActions'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { Button } from '@nostube/widgets/components/button'
import { AuthDialog } from '@nostube/widgets/components/auth/AuthDialog'

/** The header's visitor controls: sign in, or the signed-in key with a sign-out button. */
export function AuthArea({ relays }: { relays: string[] }) {
  const account = useActiveAccount()
  const profile = useProfile(account ? { pubkey: account.pubkey } : undefined)
  const { logout } = useLoginActions()
  const [authOpen, setAuthOpen] = useState(false)

  if (account) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-2 text-sm text-muted-foreground"
          title={account.pubkey}
        >
          <img
            src={profile?.picture ?? ''}
            alt=""
            className="h-7 w-7 rounded-full bg-secondary object-cover"
            onError={e => (e.currentTarget.style.visibility = 'hidden')}
          />
          {profile?.name ?? account.pubkey.slice(0, 8)}
        </span>
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAuthOpen(true)}>
        <LogIn className="h-4 w-4" />
        Sign in
      </Button>
      <AuthDialog
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={() => setAuthOpen(false)}
        relays={relays}
      />
    </>
  )
}

export default AuthArea
