import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogIn, LogOut } from 'lucide-react'
import { useActiveAccount } from 'applesauce-react/hooks'
import type { NostubeClient } from '@nostube/core/client'
import { useLoginActions } from '@nostube/widgets/hooks/useLoginActions'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { Button } from '@nostube/widgets/components/button'
import { AuthDialog } from '@nostube/widgets/components/auth/AuthDialog'
import { useVisitorProfile } from './use-visitor-profile'

/** The header's visitor controls: sign in, or the signed-in key with a sign-out button. */
export function AuthArea({ client, relays }: { client: NostubeClient; relays: string[] }) {
  const { t } = useTranslation()
  const account = useActiveAccount()
  const profile = useVisitorProfile(client, account?.pubkey)
  const { logout } = useLoginActions()
  const [authOpen, setAuthOpen] = useState(false)

  if (account) {
    const name = profile?.display_name || profile?.name || account.pubkey.slice(0, 8)
    return (
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-2 text-sm text-muted-foreground"
          title={account.pubkey}
        >
          <UserAvatar
            picture={profile?.picture}
            pubkey={account.pubkey}
            name={name}
            className="h-7 w-7"
          />
          {name}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('site.auth.signOut')}
          onClick={() => void logout()}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setAuthOpen(true)}>
        <LogIn className="h-4 w-4" />
        {t('site.auth.signIn')}
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
