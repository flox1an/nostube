// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { ChevronDown, LogOut, UserPlus, Settings, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { UserAvatar } from '@/components/UserAvatar'
import { useNavigate } from 'react-router-dom'
import { useAccountManager, useActiveAccount } from 'applesauce-react/hooks'
import { useProfile, removeAccountFromStorage, saveActiveAccount, useAppContext } from '@/hooks'
import { getDisplayName } from 'applesauce-core/helpers'
import type { IAccount } from 'applesauce-accounts'
import { WalletMenuItem } from './WalletMenuItem'
import { Button } from '../ui/button'
import { useTranslation } from 'react-i18next'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'

function AccountSwitchItem({
  account,
  onClick,
  thumbResizeServerUrl,
}: {
  account: IAccount
  onClick: () => void
  thumbResizeServerUrl?: string
}) {
  const accountProfile = useProfile({ pubkey: account.pubkey })
  const displayName = getDisplayName(accountProfile)

  return (
    <DropdownMenuItem
      onClick={onClick}
      className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
    >
      <UserAvatar
        picture={accountProfile?.picture as string}
        pubkey={account.pubkey}
        name={displayName || undefined}
        thumbResizeServerUrl={thumbResizeServerUrl}
        className="w-8 h-8"
      />
      <div className="flex-1 truncate">
        <p className="text-sm font-medium">{displayName || account.pubkey.slice(0, 8)}</p>
      </div>
    </DropdownMenuItem>
  )
}

export function AccountSwitcher() {
  const { t } = useTranslation()
  const activeAccount = useActiveAccount()
  const accountManager = useAccountManager()
  const profile = useProfile(activeAccount ? { pubkey: activeAccount?.pubkey } : undefined)
  const navigate = useNavigate()
  const { config } = useAppContext()

  if (!activeAccount || !accountManager) return null

  // Get all accounts for switching
  const allAccounts = accountManager.accounts || []
  const otherAccounts = allAccounts.filter(acc => acc.pubkey !== activeAccount.pubkey)

  const handleSwitchAccount = (account: typeof activeAccount) => {
    if (account && accountManager) {
      accountManager.setActive(account)
      saveActiveAccount(account.pubkey)
    }
  }

  const handleRemoveAccount = (account: typeof activeAccount) => {
    if (account && accountManager) {
      accountManager.removeAccount(account)
      removeAccountFromStorage(account.pubkey)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <UserAvatar
            picture={profile?.picture as string}
            pubkey={activeAccount?.pubkey}
            name={getDisplayName(profile) || undefined}
            thumbResizeServerUrl={config.thumbResizeServerUrl}
            className="w-8 h-8"
          />
          <div className="flex-1 text-left hidden md:block truncate">
            <p className="font-medium text-sm truncate">{getDisplayName(profile)}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 p-2 animate-scale-in">
        <DropdownMenuItem
          onClick={() => navigate(buildProfileUrlFromPubkey(activeAccount.pubkey))}
          className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
        >
          <User className="w-4 h-4" />
          <span>{t('auth.account.profile')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate('/playlists')}
          className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
        >
          <UserPlus className="w-4 h-4" />
          <span>{t('auth.account.playlists')}</span>
        </DropdownMenuItem>
        <WalletMenuItem />
        <DropdownMenuItem
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
        >
          <Settings className="w-4 h-4" />
          <span>{t('settings.title')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {otherAccounts.length > 0 && (
          <>
            <div className="font-medium text-sm px-2 py-1.5">{t('auth.account.switchAccount')}</div>
            {otherAccounts.map(account => (
              <AccountSwitchItem
                key={account.pubkey}
                account={account}
                onClick={() => handleSwitchAccount(account)}
                thumbResizeServerUrl={config.thumbResizeServerUrl}
              />
            ))}
          </>
        )}
        <DropdownMenuItem
          onClick={() => {
            handleRemoveAccount(activeAccount)
            // If there are other accounts, switch to the first one
            if (otherAccounts.length > 0 && accountManager) {
              accountManager.setActive(otherAccounts[0])
              saveActiveAccount(otherAccounts[0].pubkey)
            } else {
              saveActiveAccount(null)
            }
          }}
          className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('auth.account.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
