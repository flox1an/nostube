// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { ChevronDown, LogOut, Upload, UserPlus, Settings, User, ListVideo } from 'lucide-react'
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
import { useProfile, removeAccountFromStorage, saveActiveAccount } from '@/hooks'
import { getDisplayName } from 'applesauce-core/helpers'
import type { IAccount } from 'applesauce-accounts'
import { WalletMenuItem } from './WalletMenuItem'
import { Button } from '../ui/button'
import { useTranslation } from 'react-i18next'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'

import { invoke, isTauri } from '@tauri-apps/api/core'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
function AccountSwitchItem({ account, onClick }: { account: IAccount; onClick: () => void }) {
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
        className="w-8 h-8"
      />
      <div className="flex-1 truncate">
        <p className="text-sm font-medium">{displayName || account.pubkey.slice(0, 8)}</p>
      </div>
    </DropdownMenuItem>
  )
}

export function AccountSwitcher({ onAddAccount }: { onAddAccount?: () => void }) {
  const { t } = useTranslation()
  const activeAccount = useActiveAccount()
  const accountManager = useAccountManager()
  const profile = useProfile(activeAccount ? { pubkey: activeAccount?.pubkey } : undefined)
  const navigate = useNavigate()
  const [removeOpen, setRemoveOpen] = useState(false)
  const [recoveredCredential, setRecoveredCredential] = useState<string | null>(null)

  if (!activeAccount || !accountManager) return null

  // Get all accounts for switching
  const allAccounts = accountManager.accounts || []
  const otherAccounts = allAccounts.filter(acc => acc.pubkey !== activeAccount.pubkey)

  const handleSwitchAccount = (account: typeof activeAccount) => {
    if (!account || !accountManager) return
    if (isTauri()) {
      void invoke('desktop_unlock_account', { pubkey: account.pubkey })
      return
    }
    accountManager.setActive(account)
    saveActiveAccount(account.pubkey)
  }

  const handleRemoveAccount = (account: typeof activeAccount) => {
    if (account && accountManager) {
      accountManager.removeAccount(account)
      removeAccountFromStorage(account.pubkey)
    }
  }

  const lockDesktopAccount = () => {
    if (isTauri()) {
      void invoke('desktop_lock_account')
      return
    }
    handleRemoveAccount(activeAccount)
  }

  const removeDesktopAccount = () => {
    void invoke('desktop_remove_account', { pubkey: activeAccount.pubkey }).finally(() =>
      setRemoveOpen(false)
    )
  }

  const exportDesktopAccount = () => {
    void invoke<string>('desktop_export_credential', { pubkey: activeAccount.pubkey }).then(
      setRecoveredCredential
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost">
            <UserAvatar
              picture={profile?.picture as string}
              pubkey={activeAccount?.pubkey}
              name={getDisplayName(profile) || undefined}
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

          <WalletMenuItem />

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => navigate('/playlists')}
            className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
          >
            <ListVideo className="w-4 h-4" />
            <span>{t('auth.account.playlists')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 cursor-pointer p-2 rounded-md lg:hidden"
          >
            <Upload className="w-4 h-4" />
            <span>{t('header.upload')}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

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
              <div className="font-medium text-sm px-2 py-1.5">
                {t('auth.account.switchAccount')}
              </div>
              {otherAccounts.map(account => (
                <AccountSwitchItem
                  key={account.pubkey}
                  account={account}
                  onClick={() => handleSwitchAccount(account)}
                />
              ))}
            </>
          )}

          {onAddAccount && (
            <DropdownMenuItem
              onClick={onAddAccount}
              className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add account</span>
            </DropdownMenuItem>
          )}

          {isTauri() && (
            <>
              <DropdownMenuItem onClick={exportDesktopAccount}>Recover credential</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRemoveOpen(true)}
                className="text-red-500 focus:text-red-500"
              >
                Remove from this device
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            onClick={() => {
              lockDesktopAccount()
              if (!isTauri()) {
                // If there are other accounts, switch to the first one
                if (otherAccounts.length > 0 && accountManager) {
                  accountManager.setActive(otherAccounts[0])
                  saveActiveAccount(otherAccounts[0].pubkey)
                } else {
                  saveActiveAccount(null)
                }
              }
            }}
            className="flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500 focus:text-red-500"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('auth.account.logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account from this device?</AlertDialogTitle>
            <AlertDialogDescription>
              The Keychain credential and public desktop-account metadata will be deleted. Other
              accounts stay available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeDesktopAccount}>Remove account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={recoveredCredential !== null}
        onOpenChange={open => !open && setRecoveredCredential(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recovered credential</DialogTitle>
          </DialogHeader>
          <p className="break-all font-mono text-sm">{recoveredCredential}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
