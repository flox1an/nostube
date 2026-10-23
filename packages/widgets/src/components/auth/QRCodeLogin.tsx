import { useEffect, useState, useRef, useCallback, useContext } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, Smartphone, RefreshCw, Copy, Check, ExternalLink, QrCode } from 'lucide-react'
import { NostrConnectSigner } from 'applesauce-signers'
import { NostrConnectAccount } from 'applesauce-accounts/accounts'
import { AccountsContext } from 'applesauce-react'
import { Button } from '../button'
import { saveAccountToStorage, saveActiveAccount } from '../../hooks/useAccountPersistence'
import { allowSignerRelays } from '@nostube/core/instance-config'
import { useTranslation } from 'react-i18next'

interface QRCodeLoginProps {
  onLogin: () => void
  onError: (error: string) => void
  /** Phones prioritize the same-device signer-app deep link; desktop keeps QR as primary. */
  isMobile?: boolean
  /**
   * Relays the nostrconnect handshake runs on. The host app initializes
   * `NostrConnectSigner.subscriptionMethod`/`publishMethod` (the signer falls back to those
   * statics); the web app passes its default relays, instance builds their signer relays.
   */
  relays: string[]
  /** The name the signer app shows for this client (an instance shows its own). */
  clientName?: string
}

// Build a bunker:// URI from signer properties for persistence
function buildBunkerUri(remotePubkey: string, relays: string[], secret?: string): string {
  const params = new URLSearchParams()
  relays.forEach(relay => params.append('relay', relay))
  if (secret) {
    params.append('secret', secret)
  }
  return `bunker://${remotePubkey}?${params.toString()}`
}

export function QRCodeLogin({
  onLogin,
  onError,
  isMobile = false,
  relays,
  clientName = 'nostube',
}: QRCodeLoginProps) {
  const { t } = useTranslation()
  const accountManager = useContext(AccountsContext)
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Phones lead with the same-device signer link; the QR (for another device) shows on request.
  const [showQr, setShowQr] = useState(!isMobile)
  const signerRef = useRef<NostrConnectSigner | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  if (!accountManager) {
    throw new Error('QRCodeLogin must be used within AccountsProvider')
  }

  const generateQRCode = useCallback(async () => {
    // Cleanup previous signer/controller
    abortControllerRef.current?.abort()
    // This attempt's own controller: a later attempt or the unmount aborts it, never a timeout
    // (applesauce rejects the wait with "Aborted" only on our signal).
    const controller = new AbortController()

    try {
      // Pairing relays (e.g. public rendezvous relays) need not be instance relays; like bunker
      // login, allow them or the instance relay allowlist drops the signer's reply.
      allowSignerRelays(relays)

      // Create a new signer for client-initiated connection; the transport comes from the
      // host-initialized NostrConnectSigner statics. Each pairing gets a fresh client key.
      const signer = new NostrConnectSigner({ relays })
      signerRef.current = signer

      // Generate the nostrconnect:// URI
      const uri = signer.getNostrConnectURI({
        name: clientName,
        url: window.location.origin,
        image: new URL('/apple-touch-icon.png', window.location.origin).toString(),
        // 1111 (NIP-22 comments) so a connected signer can sign site comments.
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 7, 1111, 10002]),
      })

      setNostrConnectUri(uri)

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
      const bunkerUri = buildBunkerUri(remotePubkey, relays, signer.secret)

      // Persist account
      saveAccountToStorage(account, 'bunker', bunkerUri)
      saveActiveAccount(pubkey)
      // The account owns the connected signer now; unmount must not close its live session.
      if (abortControllerRef.current === controller) abortControllerRef.current = null

      onLogin()
    } catch (error) {
      // Aborted by a newer attempt or the unmount: the UI already shows that (fresh QR, or the
      // tab is gone), so stay silent.
      if (controller.signal.aborted) return
      console.error('QR code login failed:', error)
      onError(error instanceof Error ? error.message : 'Connection failed')
    }
  }, [accountManager, onLogin, onError, relays, clientName])

  // Generate QR code on mount
  useEffect(() => {
    generateQRCode()

    return () => {
      // Cleanup on unmount
      abortControllerRef.current?.abort()
    }
  }, [generateQRCode])

  const handleRefresh = () => {
    setNostrConnectUri(null)
    setCopied(false)
    generateQRCode()
  }

  const handleCopy = async () => {
    if (!nostrConnectUri) return
    try {
      await navigator.clipboard.writeText(nostrConnectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      {isMobile ? (
        <div className="w-full text-center space-y-3">
          <h3 className="text-sm font-semibold">{t('auth.login.thisDevice', 'On this device')}</h3>
          <p className="text-sm text-muted-foreground">
            {t(
              'auth.login.qrMobileDescription',
              'Sign in with your Nostr signer app on this device'
            )}
          </p>
          {nostrConnectUri ? (
            <Button asChild className="w-full rounded-full py-6">
              <a href={nostrConnectUri}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('auth.login.qrOpen', 'Use Signer')}
              </a>
            </Button>
          ) : (
            <Button className="w-full rounded-full py-6" disabled>
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('auth.login.qrOpen', 'Use Signer')}
            </Button>
          )}
        </div>
      ) : (
        <div className="text-center">
          <Smartphone className="w-10 h-10 mx-auto mb-2 text-primary" />
          <p className="text-sm text-muted-foreground">
            {t('auth.login.qrDescription', 'Scan with your Nostr signer app')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('auth.login.qrApps', 'Amber, Nostrudel, or other NIP-46 signers')}
          </p>
        </div>
      )}

      {isMobile && (
        <div className="w-full border-t pt-4 text-center space-y-3">
          <h3 className="text-sm font-semibold">
            {t('auth.login.otherDevice', 'On another device')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('auth.login.qrDescription', 'Scan with your Nostr signer app')}
          </p>
          {/* The pairing stays active either way; this only toggles its display. */}
          <Button
            variant="outline"
            className="h-11 w-full rounded-full"
            aria-expanded={showQr}
            onClick={() => setShowQr(!showQr)}
          >
            <QrCode className="w-4 h-4 mr-2" />
            {showQr
              ? t('auth.login.qrHide', 'Hide QR code')
              : t('auth.login.qrShow', 'Show QR code')}
          </Button>
        </div>
      )}

      {showQr && (
        <div className="p-4 bg-white rounded-xl">
          {nostrConnectUri ? (
            <QRCodeSVG value={nostrConnectUri} size={200} level="M" includeMargin={false} />
          ) : (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={!nostrConnectUri}
          className="h-11 min-w-11 text-muted-foreground sm:h-9 sm:min-w-0"
          aria-label={copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
          title={copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
        {!isMobile &&
          (nostrConnectUri ? (
            <Button asChild variant="default" size="sm">
              <a href={nostrConnectUri}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('auth.login.qrOpen', 'Use Signer')}
              </a>
            </Button>
          ) : (
            <Button variant="default" size="sm" disabled>
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('auth.login.qrOpen', 'Use Signer')}
            </Button>
          ))}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          className="h-11 w-11 shrink-0 text-muted-foreground sm:h-8 sm:w-8"
          aria-label={t('auth.login.qrRefresh', 'New Code')}
          title={t('auth.login.qrRefresh', 'New Code')}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
