import { useEffect, useState, useRef, useCallback, useContext } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, Smartphone, RefreshCw } from 'lucide-react'
import { NostrConnectSigner } from 'applesauce-signers'
import { NostrConnectAccount } from 'applesauce-accounts/accounts'
import { AccountsContext } from 'applesauce-react'
import { Button } from '@/components/ui/button'
import { saveAccountToStorage, saveActiveAccount } from '@/hooks/useAccountPersistence'
import { presetRelays } from '@/constants/relays'
import { subscriptionMethod, publishMethod } from '@/nostr/core'
import { useTranslation } from 'react-i18next'

// Relays used for nostrconnect communication
const NOSTRCONNECT_RELAYS = presetRelays.map(r => r.url)

// Build a bunker:// URI from signer properties for persistence
function buildBunkerUri(remotePubkey: string, relays: string[], secret?: string): string {
  const params = new URLSearchParams()
  relays.forEach(relay => params.append('relay', relay))
  if (secret) {
    params.append('secret', secret)
  }
  return `bunker://${remotePubkey}?${params.toString()}`
}

interface QRCodeLoginProps {
  onLogin: () => void
  onError: (error: string) => void
}

export function QRCodeLogin({ onLogin, onError }: QRCodeLoginProps) {
  const { t } = useTranslation()
  const accountManager = useContext(AccountsContext)
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null)
  const signerRef = useRef<NostrConnectSigner | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  if (!accountManager) {
    throw new Error('QRCodeLogin must be used within AccountsProvider')
  }

  const generateQRCode = useCallback(async () => {
    // Cleanup previous signer/controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    try {
      // Create a new signer for client-initiated connection
      const signer = new NostrConnectSigner({
        relays: NOSTRCONNECT_RELAYS,
        subscriptionMethod,
        publishMethod,
      })
      signerRef.current = signer

      // Generate the nostrconnect:// URI
      const uri = signer.getNostrConnectURI({
        name: 'nostube',
        url: window.location.origin,
        image: `${window.location.origin}/nostube.png`,
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 7, 10002]),
      })

      setNostrConnectUri(uri)

      // Create abort controller for cancellation
      const controller = new AbortController()
      abortControllerRef.current = controller

      // Wait for signer to connect
      await signer.waitForSigner(controller.signal)

      // Connected! Get pubkey and create account
      const pubkey = await signer.getPublicKey()
      const account = new NostrConnectAccount(pubkey, signer)

      // Add to account manager
      await accountManager.addAccount(account)
      accountManager.setActive(account)

      // Build bunker URI for persistence using signer properties
      // After waitForSigner(), signer.remote contains the remote signer's pubkey
      const remotePubkey = signer.remote
      if (!remotePubkey) {
        throw new Error('Failed to get remote signer pubkey')
      }
      const bunkerUri = buildBunkerUri(remotePubkey, NOSTRCONNECT_RELAYS, signer.secret)

      // Persist account
      saveAccountToStorage(account, 'bunker', bunkerUri)
      saveActiveAccount(pubkey)

      onLogin()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled, ignore
        return
      }
      console.error('QR code login failed:', error)
      onError(error instanceof Error ? error.message : 'Connection failed')
    }
  }, [accountManager, onLogin, onError])

  // Generate QR code on mount
  useEffect(() => {
    generateQRCode()

    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [generateQRCode])

  const handleRefresh = () => {
    setNostrConnectUri(null)
    generateQRCode()
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <Smartphone className="w-10 h-10 mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground">
          {t('auth.login.qrDescription', 'Scan with your Nostr signer app')}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('auth.login.qrApps', 'Amber, Nostrudel, or other NIP-46 signers')}
        </p>
      </div>

      <div className="p-4 bg-white rounded-xl">
        {nostrConnectUri ? (
          <QRCodeSVG value={nostrConnectUri} size={200} level="M" includeMargin={false} />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={handleRefresh} className="text-muted-foreground">
        <RefreshCw className="w-4 h-4 mr-2" />
        {t('auth.login.qrRefresh', 'Generate new code')}
      </Button>
    </div>
  )
}
