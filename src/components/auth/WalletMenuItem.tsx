import { useState } from 'react'
import { Wallet, Zap, Radio, Coins } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useWalletContext } from '@/contexts/WalletContext'
import { formatSats } from '@/lib/zap-utils'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WalletSection } from '@/components/settings/WalletSection'

export function WalletMenuItem() {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { walletType, isConnected, balance } = useWalletContext()

  return (
    <>
      <DropdownMenuItem
        onSelect={event => {
          event.preventDefault()
          setDialogOpen(true)
        }}
        className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
      >
        <Wallet className="w-4 h-4" />
        <div className="flex-1 flex items-center justify-between">
          <span>{t('wallet.title')}</span>
          {isConnected && balance !== null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {walletType === 'nwc' ? (
                <Radio className="h-3 w-3 text-yellow-500" />
              ) : (
                <Coins className="h-3 w-3 text-purple-500" />
              )}
              <Zap className="h-3 w-3 text-yellow-500" />
              <span>{formatSats(Math.floor(walletType === 'nwc' ? balance / 1000 : balance))}</span>
            </div>
          )}
        </div>
      </DropdownMenuItem>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('wallet.title')}</DialogTitle>
            <DialogDescription>{t('wallet.description')}</DialogDescription>
          </DialogHeader>
          <WalletSection />
        </DialogContent>
      </Dialog>
    </>
  )
}
