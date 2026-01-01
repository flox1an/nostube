import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWallet } from '@/hooks'
import { formatSats } from '@/lib/zap-utils'
import { Loader2, Zap, ExternalLink } from 'lucide-react'

export function WalletSection() {
  const { t } = useTranslation()
  const [connectionString, setConnectionString] = useState('')
  const {
    isConnected,
    isConnecting,
    balance,
    walletInfo,
    error,
    connect,
    disconnect,
    refreshBalance,
  } = useWallet()

  const handleConnect = async () => {
    try {
      await connect(connectionString.trim())
      setConnectionString('')
    } catch {
      // Error handled by context
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && connectionString.trim()) {
      handleConnect()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('wallet.description')}</p>

      {isConnected ? (
        <>
          {/* Connected state */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="font-medium">{walletInfo?.alias || 'Connected Wallet'}</span>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect}>
                Disconnect
              </Button>
            </div>

            {balance !== null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span>Balance: {formatSats(Math.floor(balance / 1000))} sats</span>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={refreshBalance}>
                  Refresh
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Disconnected state */}
          <div className="space-y-2">
            <Label htmlFor="nwc-settings">NWC Connection String</Label>
            <Input
              id="nwc-settings"
              placeholder="nostr+walletconnect://..."
              value={connectionString}
              onChange={e => setConnectionString(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex items-center justify-between">
            <a
              href="https://nwc.getalby.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Get NWC from Alby
              <ExternalLink className="h-3 w-3" />
            </a>

            <Button onClick={handleConnect} disabled={!connectionString.trim() || isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Wallet'
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
