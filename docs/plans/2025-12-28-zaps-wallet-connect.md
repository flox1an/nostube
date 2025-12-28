# Zaps & Wallet Connect Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add lightning zaps to video events with NWC wallet integration

**Architecture:** WalletContext provides NWC client state, useZap hook handles NIP-57 zap request flow, ZapButton integrates with existing VideoReactionButtons

**Tech Stack:** applesauce-wallet-connect (NIP-47), nostr-tools/nip57, React Context, localStorage

---

## Task 1: WalletContext - Core wallet state management

**Files:**

- Create: `src/contexts/WalletContext.tsx`
- Create: `src/hooks/useWallet.ts`

**Step 1: Create WalletContext with types and state**

```tsx
// src/contexts/WalletContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { WalletConnect } from 'applesauce-wallet-connect'
import { pool, subscriptionMethod, publishMethod } from '@/nostr/core'

const NWC_STORAGE_KEY = 'nwc-connection'

interface WalletInfo {
  alias?: string
  pubkey?: string
  methods: string[]
}

interface WalletContextValue {
  isConnected: boolean
  isConnecting: boolean
  balance: number | null
  walletInfo: WalletInfo | null
  error: string | null
  connect: (connectionString: string) => Promise<void>
  disconnect: () => void
  refreshBalance: () => Promise<void>
  payInvoice: (bolt11: string) => Promise<{ preimage: string }>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletConnect | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore connection on mount
  useEffect(() => {
    const stored = localStorage.getItem(NWC_STORAGE_KEY)
    if (stored) {
      connectInternal(stored).catch(console.error)
    }
  }, [])

  const connectInternal = async (connectionString: string) => {
    setIsConnecting(true)
    setError(null)

    try {
      // Validate URI format
      if (!connectionString.startsWith('nostr+walletconnect://')) {
        throw new Error('Invalid NWC URI format')
      }

      // Set up static methods for applesauce-wallet-connect
      WalletConnect.pool = pool
      WalletConnect.subscriptionMethod = subscriptionMethod
      WalletConnect.publishMethod = publishMethod

      const client = WalletConnect.fromConnectURI(connectionString)

      // Get wallet info
      const info = await client.getInfo()
      setWalletInfo({
        alias: info.alias,
        pubkey: info.pubkey,
        methods: info.methods,
      })

      // Get balance
      const balanceResult = await client.getBalance()
      setBalance(balanceResult.balance)

      setWallet(client)
      localStorage.setItem(NWC_STORAGE_KEY, connectionString)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet')
      throw err
    } finally {
      setIsConnecting(false)
    }
  }

  const connect = useCallback(async (connectionString: string) => {
    await connectInternal(connectionString)
  }, [])

  const disconnect = useCallback(() => {
    setWallet(null)
    setBalance(null)
    setWalletInfo(null)
    setError(null)
    localStorage.removeItem(NWC_STORAGE_KEY)
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!wallet) return
    try {
      const result = await wallet.getBalance()
      setBalance(result.balance)
    } catch (err) {
      console.error('Failed to refresh balance:', err)
    }
  }, [wallet])

  const payInvoice = useCallback(
    async (bolt11: string) => {
      if (!wallet) throw new Error('Wallet not connected')
      const result = await wallet.payInvoice(bolt11)
      // Refresh balance after payment
      refreshBalance()
      return result
    },
    [wallet, refreshBalance]
  )

  return (
    <WalletContext.Provider
      value={{
        isConnected: wallet !== null,
        isConnecting,
        balance,
        walletInfo,
        error,
        connect,
        disconnect,
        refreshBalance,
        payInvoice,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWalletContext() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWalletContext must be used within WalletProvider')
  }
  return context
}
```

**Step 2: Create useWallet hook**

```tsx
// src/hooks/useWallet.ts
export { useWalletContext as useWallet } from '@/contexts/WalletContext'
```

**Step 3: Add to hooks/index.ts export**

Add to `src/hooks/index.ts`:

```typescript
export { useWallet } from './useWallet'
```

**Step 4: Integrate WalletProvider into App**

Modify `src/components/AppProvider.tsx` - add WalletProvider inside the existing provider chain:

```tsx
import { WalletProvider } from '@/contexts/WalletContext'

// Inside the provider chain, wrap with WalletProvider
;<WalletProvider>{/* existing children */}</WalletProvider>
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/contexts/WalletContext.tsx src/hooks/useWallet.ts src/hooks/index.ts src/components/AppProvider.tsx
git commit -m "feat(wallet): add WalletContext and useWallet hook for NWC"
```

---

## Task 2: Zap utilities - LNURL and zap request helpers

**Files:**

- Create: `src/lib/zap-utils.ts`

**Step 1: Create zap utility functions**

```typescript
// src/lib/zap-utils.ts
import { getZapEndpoint, makeZapRequest, getSatoshisAmountFromBolt11 } from 'nostr-tools/nip57'
import type { NostrEvent, EventTemplate } from 'nostr-tools'

export interface ZapRequestParams {
  recipientPubkey: string
  amount: number // in sats
  comment?: string
  relays: string[]
  eventId?: string
  eventKind?: number
}

/**
 * Fetch the LNURL pay endpoint from a user's profile
 */
export async function getRecipientZapEndpoint(profile: NostrEvent): Promise<string | null> {
  return getZapEndpoint(profile)
}

/**
 * Create an unsigned zap request event template
 */
export function createZapRequest(params: ZapRequestParams): EventTemplate {
  const { recipientPubkey, amount, comment, relays, eventId, eventKind } = params

  const amountMsats = amount * 1000

  if (eventId) {
    // Zapping an event
    return makeZapRequest({
      event: {
        id: eventId,
        pubkey: recipientPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: eventKind || 1,
        tags: [],
        content: '',
        sig: '',
      } as NostrEvent,
      amount: amountMsats,
      comment,
      relays,
    })
  } else {
    // Zapping a profile
    return makeZapRequest({
      pubkey: recipientPubkey,
      amount: amountMsats,
      comment,
      relays,
    })
  }
}

/**
 * Request an invoice from the LNURL callback
 */
export async function requestInvoice(
  callback: string,
  amount: number, // in sats
  zapRequest: NostrEvent
): Promise<string> {
  const amountMsats = amount * 1000
  const encodedZapRequest = encodeURIComponent(JSON.stringify(zapRequest))

  const url = new URL(callback)
  url.searchParams.set('amount', amountMsats.toString())
  url.searchParams.set('nostr', encodedZapRequest)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`LNURL request failed: ${response.status}`)
  }

  const data = await response.json()
  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'LNURL request failed')
  }

  if (!data.pr) {
    throw new Error('No invoice returned from LNURL')
  }

  return data.pr
}

/**
 * Parse the amount from a bolt11 invoice
 */
export function getInvoiceAmount(bolt11: string): number {
  return getSatoshisAmountFromBolt11(bolt11)
}

/**
 * Format sats for display (e.g., 21500 -> "21.5k")
 */
export function formatSats(sats: number): string {
  if (sats >= 1_000_000) {
    return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (sats >= 1_000) {
    return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return sats.toString()
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/zap-utils.ts
git commit -m "feat(zap): add zap utility functions for LNURL and NIP-57"
```

---

## Task 3: useZap hook - Complete zap flow

**Files:**

- Create: `src/hooks/useZap.ts`

**Step 1: Create useZap hook**

```typescript
// src/hooks/useZap.ts
import { useState, useCallback } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { useCurrentUser, useWallet, useAppContext, useNostrPublish } from '@/hooks'
import { getRecipientZapEndpoint, createZapRequest, requestInvoice } from '@/lib/zap-utils'
import { toast } from 'sonner'

const DEFAULT_ZAP_AMOUNT = 21

interface UseZapOptions {
  eventId: string
  eventKind: number
  authorPubkey: string
}

interface UseZapReturn {
  zap: (amount?: number, comment?: string) => Promise<boolean>
  isZapping: boolean
  needsWallet: boolean
  openWalletDialog: () => void
}

export function useZap({ eventId, eventKind, authorPubkey }: UseZapOptions): UseZapReturn {
  const [isZapping, setIsZapping] = useState(false)
  const [showWalletDialog, setShowWalletDialog] = useState(false)
  const { user } = useCurrentUser()
  const { isConnected, payInvoice } = useWallet()
  const { config } = useAppContext()
  const { publish } = useNostrPublish()
  const eventStore = useEventStore()

  const zap = useCallback(
    async (amount: number = DEFAULT_ZAP_AMOUNT, comment?: string): Promise<boolean> => {
      if (!user) {
        toast.error('Please log in to zap')
        return false
      }

      if (!isConnected) {
        setShowWalletDialog(true)
        return false
      }

      setIsZapping(true)

      try {
        // Get author's profile to find their lightning address
        const profile = eventStore.getEvent(authorPubkey, 0)
        if (!profile) {
          toast.error('Could not load author profile')
          return false
        }

        // Get LNURL endpoint
        const zapEndpoint = await getRecipientZapEndpoint(profile)
        if (!zapEndpoint) {
          toast.error('Author cannot receive zaps (no lightning address)')
          return false
        }

        // Get write relays
        const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

        // Create zap request
        const zapRequestTemplate = createZapRequest({
          recipientPubkey: authorPubkey,
          amount,
          comment,
          relays: writeRelays,
          eventId,
          eventKind,
        })

        // Sign the zap request
        const signedZapRequest = await publish({
          event: zapRequestTemplate,
          relays: [], // Don't publish to relays, just sign
          skipPublish: true,
        })

        // Request invoice from LNURL
        const bolt11 = await requestInvoice(zapEndpoint, amount, signedZapRequest)

        // Pay the invoice via NWC
        await payInvoice(bolt11)

        toast.success(`Zapped ${amount} sats!`)
        return true
      } catch (err) {
        console.error('Zap failed:', err)
        toast.error(err instanceof Error ? err.message : 'Zap failed')
        return false
      } finally {
        setIsZapping(false)
      }
    },
    [
      user,
      isConnected,
      eventStore,
      authorPubkey,
      config.relays,
      eventId,
      eventKind,
      publish,
      payInvoice,
    ]
  )

  return {
    zap,
    isZapping,
    needsWallet: showWalletDialog,
    openWalletDialog: () => setShowWalletDialog(true),
  }
}
```

**Step 2: Add skipPublish support to useNostrPublish**

Check if `useNostrPublish` supports `skipPublish` option. If not, we need to adjust the approach to just sign the event without publishing. Let me check and update:

```typescript
// Update in useZap.ts - use signer directly instead of publish
import { useAccountManager } from 'applesauce-react/hooks'

// Replace the sign step with:
const accountManager = useAccountManager()
const signer = accountManager?.active?.signer
if (!signer) throw new Error('No signer available')

const signedZapRequest = {
  ...zapRequestTemplate,
  pubkey: user.pubkey,
  id: '', // Will be set after signing
  sig: '',
}
// Use nostr-tools to finalize
import { finalizeEvent } from 'nostr-tools'
const finalized = finalizeEvent(zapRequestTemplate, signer.secretKey)
```

Actually, let's check how the existing publish flow works and adapt:

**Step 2 (revised): Update useZap to sign without publishing**

```typescript
// src/hooks/useZap.ts
import { useState, useCallback } from 'react'
import { useEventStore, useStoreQuery } from 'applesauce-react/hooks'
import { ProfileQuery } from 'applesauce-core/queries'
import { useCurrentUser, useWallet, useAppContext } from '@/hooks'
import { getRecipientZapEndpoint, createZapRequest, requestInvoice } from '@/lib/zap-utils'
import { toast } from 'sonner'
import { useAccountManager } from 'applesauce-accounts/react'

const DEFAULT_ZAP_AMOUNT = 21

interface UseZapOptions {
  eventId: string
  eventKind: number
  authorPubkey: string
}

interface UseZapReturn {
  zap: (amount?: number, comment?: string) => Promise<boolean>
  isZapping: boolean
  needsWallet: boolean
  setNeedsWallet: (value: boolean) => void
}

export function useZap({ eventId, eventKind, authorPubkey }: UseZapOptions): UseZapReturn {
  const [isZapping, setIsZapping] = useState(false)
  const [needsWallet, setNeedsWallet] = useState(false)
  const { user } = useCurrentUser()
  const { isConnected, payInvoice } = useWallet()
  const { config } = useAppContext()
  const eventStore = useEventStore()
  const accountManager = useAccountManager()

  // Load author profile
  const profile = useStoreQuery(ProfileQuery, [authorPubkey])

  const zap = useCallback(
    async (amount: number = DEFAULT_ZAP_AMOUNT, comment?: string): Promise<boolean> => {
      if (!user) {
        toast.error('Please log in to zap')
        return false
      }

      if (!isConnected) {
        setNeedsWallet(true)
        return false
      }

      const signer = accountManager?.active?.signer
      if (!signer) {
        toast.error('No signer available')
        return false
      }

      setIsZapping(true)

      try {
        // Get author's profile event
        const profileEvent = eventStore.getEvent(authorPubkey, 0)
        if (!profileEvent) {
          toast.error('Could not load author profile')
          return false
        }

        // Get LNURL endpoint
        const zapEndpoint = await getRecipientZapEndpoint(profileEvent)
        if (!zapEndpoint) {
          toast.error('Author cannot receive zaps (no lightning address)')
          return false
        }

        // Get write relays
        const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

        // Create zap request template
        const zapRequestTemplate = createZapRequest({
          recipientPubkey: authorPubkey,
          amount,
          comment,
          relays: writeRelays,
          eventId,
          eventKind,
        })

        // Sign the zap request (kind 9734)
        const signedZapRequest = await signer.signEvent(zapRequestTemplate)

        // Request invoice from LNURL
        const bolt11 = await requestInvoice(zapEndpoint, amount, signedZapRequest)

        // Pay the invoice via NWC
        await payInvoice(bolt11)

        toast.success(`Zapped ${amount} sats!`)
        return true
      } catch (err) {
        console.error('Zap failed:', err)
        toast.error(err instanceof Error ? err.message : 'Zap failed')
        return false
      } finally {
        setIsZapping(false)
      }
    },
    [
      user,
      isConnected,
      accountManager,
      eventStore,
      authorPubkey,
      config.relays,
      eventId,
      eventKind,
      payInvoice,
    ]
  )

  return {
    zap,
    isZapping,
    needsWallet,
    setNeedsWallet,
  }
}
```

**Step 3: Add to hooks/index.ts**

```typescript
export { useZap } from './useZap'
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/useZap.ts src/hooks/index.ts
git commit -m "feat(zap): add useZap hook for complete zap flow"
```

---

## Task 4: useVideoZaps hook - Load zap receipts

**Files:**

- Create: `src/hooks/useVideoZaps.ts`

**Step 1: Create useVideoZaps hook**

```typescript
// src/hooks/useVideoZaps.ts
import { useMemo } from 'react'
import { useObservableMemo } from 'applesauce-react/hooks'
import { getInvoiceAmount } from '@/lib/zap-utils'
import { eventStore, pool } from '@/nostr/core'
import { type NostrEvent } from 'nostr-tools'

interface UseVideoZapsReturn {
  totalSats: number
  zapCount: number
  zaps: NostrEvent[]
  isLoading: boolean
}

export function useVideoZaps(eventId: string, authorPubkey: string): UseVideoZapsReturn {
  // Create timeline loader for zap receipts (kind 9735)
  const zaps = useObservableMemo(() => {
    const filter = {
      kinds: [9735],
      '#e': [eventId],
    }

    // Subscribe to zap receipts
    return eventStore.timeline(filter)
  }, [eventId])

  // Calculate total sats from zap receipts
  const { totalSats, zapCount } = useMemo(() => {
    if (!zaps || zaps.length === 0) {
      return { totalSats: 0, zapCount: 0 }
    }

    let total = 0
    const seenPayments = new Set<string>()

    for (const zap of zaps) {
      // Get bolt11 from tags
      const bolt11Tag = zap.tags.find(t => t[0] === 'bolt11')
      const bolt11 = bolt11Tag?.[1]

      if (bolt11 && !seenPayments.has(bolt11)) {
        seenPayments.add(bolt11)
        try {
          const amount = getInvoiceAmount(bolt11)
          total += amount
        } catch {
          // Invalid bolt11, skip
        }
      }
    }

    return { totalSats: total, zapCount: seenPayments.size }
  }, [zaps])

  return {
    totalSats,
    zapCount,
    zaps: zaps || [],
    isLoading: !zaps,
  }
}
```

**Step 2: Add to hooks/index.ts**

```typescript
export { useVideoZaps } from './useVideoZaps'
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/hooks/useVideoZaps.ts src/hooks/index.ts
git commit -m "feat(zap): add useVideoZaps hook to load zap receipts"
```

---

## Task 5: WalletConnectDialog component

**Files:**

- Create: `src/components/WalletConnectDialog.tsx`

**Step 1: Create WalletConnectDialog**

```tsx
// src/components/WalletConnectDialog.tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWallet } from '@/hooks'
import { Loader2, ExternalLink } from 'lucide-react'

interface WalletConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
}

export function WalletConnectDialog({ open, onOpenChange, onConnected }: WalletConnectDialogProps) {
  const [connectionString, setConnectionString] = useState('')
  const { connect, isConnecting, error } = useWallet()

  const handleConnect = async () => {
    try {
      await connect(connectionString.trim())
      onOpenChange(false)
      onConnected?.()
    } catch {
      // Error is handled by context
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && connectionString.trim()) {
      handleConnect()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Lightning Wallet</DialogTitle>
          <DialogDescription>
            Connect your wallet using Nostr Wallet Connect (NWC) to send zaps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nwc-uri">NWC Connection String</Label>
            <Input
              id="nwc-uri"
              placeholder="nostr+walletconnect://..."
              value={connectionString}
              onChange={e => setConnectionString(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <a
              href="https://nwc.getalby.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              Get NWC from Alby
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={!connectionString.trim() || isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/WalletConnectDialog.tsx
git commit -m "feat(wallet): add WalletConnectDialog for NWC onboarding"
```

---

## Task 6: ZapDialog component

**Files:**

- Create: `src/components/ZapDialog.tsx`

**Step 1: Create ZapDialog**

```tsx
// src/components/ZapDialog.tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useProfile } from '@/hooks'
import { Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000]

interface ZapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  authorPubkey: string
  onZap: (amount: number, comment?: string) => Promise<boolean>
  isZapping: boolean
}

export function ZapDialog({ open, onOpenChange, authorPubkey, onZap, isZapping }: ZapDialogProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(100)
  const [customAmount, setCustomAmount] = useState('')
  const [comment, setComment] = useState('')
  const profile = useProfile(authorPubkey)

  const displayName = profile?.display_name || profile?.name || authorPubkey.slice(0, 8)
  const avatar = profile?.picture

  const effectiveAmount = customAmount ? parseInt(customAmount, 10) : selectedAmount

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount)
    setCustomAmount('')
  }

  const handleCustomChange = (value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '')
    setCustomAmount(cleaned)
    if (cleaned) {
      setSelectedAmount(0) // Deselect presets
    }
  }

  const handleZap = async () => {
    if (effectiveAmount < 1) return
    const success = await onZap(effectiveAmount, comment || undefined)
    if (success) {
      onOpenChange(false)
      setComment('')
      setCustomAmount('')
      setSelectedAmount(100)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Send Zap
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={avatar} />
              <AvatarFallback>{displayName[0]}</AvatarFallback>
            </Avatar>
            <span>to {displayName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preset amounts */}
          <div className="space-y-2">
            <Label>Amount (sats)</Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_AMOUNTS.map(amount => (
                <Button
                  key={amount}
                  variant={selectedAmount === amount && !customAmount ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetClick(amount)}
                  className={cn(
                    'text-xs',
                    selectedAmount === amount && !customAmount && 'ring-2 ring-primary'
                  )}
                >
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div className="space-y-2">
            <Label htmlFor="custom-amount">Custom amount</Label>
            <div className="relative">
              <Input
                id="custom-amount"
                placeholder="Enter amount"
                value={customAmount}
                onChange={e => handleCustomChange(e.target.value)}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                sats
              </span>
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="zap-comment">Comment (optional)</Label>
            <Textarea
              id="zap-comment"
              placeholder="Add a message..."
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 140))}
              maxLength={140}
              rows={2}
            />
            <p className="text-xs text-muted-foreground text-right">{comment.length}/140</p>
          </div>

          {/* Zap button */}
          <Button
            className="w-full"
            onClick={handleZap}
            disabled={effectiveAmount < 1 || isZapping}
          >
            {isZapping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zapping...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Zap {effectiveAmount} sats
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/ZapDialog.tsx
git commit -m "feat(zap): add ZapDialog with preset amounts and comment"
```

---

## Task 7: ZapButton component

**Files:**

- Create: `src/components/ZapButton.tsx`

**Step 1: Create ZapButton with long-press support**

```tsx
// src/components/ZapButton.tsx
import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useZap, useVideoZaps, useCurrentUser } from '@/hooks'
import { formatSats } from '@/lib/zap-utils'
import { ZapDialog } from './ZapDialog'
import { WalletConnectDialog } from './WalletConnectDialog'

interface ZapButtonProps {
  eventId: string
  kind: number
  authorPubkey: string
  layout?: 'vertical' | 'inline'
  className?: string
}

const LONG_PRESS_DELAY = 500

export function ZapButton({
  eventId,
  kind,
  authorPubkey,
  layout = 'vertical',
  className = '',
}: ZapButtonProps) {
  const [showZapDialog, setShowZapDialog] = useState(false)
  const [showWalletDialog, setShowWalletDialog] = useState(false)
  const longPressTimer = useRef<number | null>(null)
  const isLongPress = useRef(false)

  const { user } = useCurrentUser()
  const { zap, isZapping, needsWallet, setNeedsWallet } = useZap({
    eventId,
    eventKind: kind,
    authorPubkey,
  })
  const { totalSats } = useVideoZaps(eventId, authorPubkey)

  const isOwnContent = user?.pubkey === authorPubkey

  // Handle wallet dialog state from useZap
  const handleWalletNeeded = useCallback(() => {
    if (needsWallet) {
      setShowWalletDialog(true)
      setNeedsWallet(false)
    }
  }, [needsWallet, setNeedsWallet])

  // Check if wallet is needed after zap attempt
  if (needsWallet && !showWalletDialog) {
    handleWalletNeeded()
  }

  const handleQuickZap = async () => {
    if (isLongPress.current) return
    await zap()
  }

  const handlePointerDown = () => {
    isLongPress.current = false
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true
      setShowZapDialog(true)
    }, LONG_PRESS_DELAY)
  }

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowZapDialog(true)
  }

  const handleZapFromDialog = async (amount: number, comment?: string) => {
    return zap(amount, comment)
  }

  const handleWalletConnected = () => {
    // Retry the pending zap if there was one
  }

  if (layout === 'inline') {
    return (
      <>
        <Button
          variant="secondary"
          className={className}
          onClick={handleQuickZap}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
          disabled={!user || isZapping || isOwnContent}
          aria-label="Zap"
        >
          {isZapping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
          )}
          <span className="ml-2">{formatSats(totalSats)}</span>
        </Button>

        <ZapDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          authorPubkey={authorPubkey}
          onZap={handleZapFromDialog}
          isZapping={isZapping}
        />

        <WalletConnectDialog
          open={showWalletDialog}
          onOpenChange={setShowWalletDialog}
          onConnected={handleWalletConnected}
        />
      </>
    )
  }

  // Vertical layout (for Shorts)
  return (
    <>
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full"
          onClick={handleQuickZap}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
          disabled={!user || isZapping || isOwnContent}
          aria-label="Zap"
        >
          {isZapping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
          )}
        </Button>
        <span className="text-sm font-medium">{formatSats(totalSats)}</span>
      </div>

      <ZapDialog
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        authorPubkey={authorPubkey}
        onZap={handleZapFromDialog}
        isZapping={isZapping}
      />

      <WalletConnectDialog
        open={showWalletDialog}
        onOpenChange={setShowWalletDialog}
        onConnected={handleWalletConnected}
      />
    </>
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/ZapButton.tsx
git commit -m "feat(zap): add ZapButton with quick-zap and long-press"
```

---

## Task 8: Integrate ZapButton into VideoReactionButtons

**Files:**

- Modify: `src/components/VideoReactionButtons.tsx`

**Step 1: Add ZapButton to VideoReactionButtons**

Add import at top:

```typescript
import { ZapButton } from './ZapButton'
```

Add `relays` prop to the component (if not already there).

In the inline layout section (after downvote button), add:

```tsx
<ZapButton
  eventId={eventId}
  kind={kind}
  authorPubkey={authorPubkey}
  layout="inline"
  className={className}
/>
```

In the vertical layout section (after downvote div), add:

```tsx
<ZapButton
  eventId={eventId}
  kind={kind}
  authorPubkey={authorPubkey}
  layout="vertical"
  className={className}
/>
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/VideoReactionButtons.tsx
git commit -m "feat(zap): integrate ZapButton into VideoReactionButtons"
```

---

## Task 9: WalletSection for Settings page

**Files:**

- Create: `src/components/settings/WalletSection.tsx`
- Modify: `src/pages/settings/SettingsPage.tsx`

**Step 1: Create WalletSection**

```tsx
// src/components/settings/WalletSection.tsx
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWallet } from '@/hooks'
import { formatSats } from '@/lib/zap-utils'
import { Loader2, Wallet, Zap, ExternalLink } from 'lucide-react'

export function WalletSection() {
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Lightning Wallet
        </CardTitle>
        <CardDescription>
          Connect your lightning wallet to send zaps using Nostr Wallet Connect (NWC)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}
```

**Step 2: Add WalletSection to SettingsPage**

Import and add `<WalletSection />` to the settings page layout.

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/settings/WalletSection.tsx src/pages/settings/SettingsPage.tsx
git commit -m "feat(wallet): add WalletSection to settings page"
```

---

## Task 10: Add translations

**Files:**

- Modify: `src/i18n/locales/en.json`

**Step 1: Add wallet and zap translations**

Add to en.json under appropriate sections:

```json
{
  "wallet": {
    "title": "Lightning Wallet",
    "description": "Connect your lightning wallet to send zaps",
    "connect": "Connect Wallet",
    "disconnect": "Disconnect",
    "connecting": "Connecting...",
    "connected": "Connected",
    "balance": "Balance",
    "refresh": "Refresh",
    "nwcPlaceholder": "nostr+walletconnect://...",
    "getAlby": "Get NWC from Alby",
    "invalidUri": "Invalid NWC URI format",
    "connectionFailed": "Failed to connect wallet"
  },
  "zap": {
    "send": "Send Zap",
    "zapping": "Zapping...",
    "amount": "Amount (sats)",
    "customAmount": "Custom amount",
    "comment": "Comment (optional)",
    "commentPlaceholder": "Add a message...",
    "success": "Zapped {{amount}} sats!",
    "noLightningAddress": "Author cannot receive zaps",
    "loginRequired": "Please log in to zap",
    "failed": "Zap failed"
  }
}
```

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/i18n/locales/*.json
git commit -m "feat(i18n): add wallet and zap translations"
```

---

## Task 11: Update CHANGELOG and final build

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Add changelog entry**

Add under `## [Unreleased]` → `### Added`:

```markdown
- **Lightning Zaps**: Send zaps to video creators with NIP-57 support. Quick zap (21 sats) on click, custom amount on long-press/right-click with preset amounts (21, 100, 500, 1000, 5000) and optional comment
- **Nostr Wallet Connect**: NIP-47 wallet integration via `applesauce-wallet-connect`. Connect wallet in Settings or on first zap attempt. Shows wallet balance and supports Alby and other NWC-compatible wallets
- **Zap Display**: Shows total sats received on videos with formatted display (e.g., "21.5k")
```

**Step 2: Run full test suite**

Run: `npm run test`
Expected: PASS

**Step 3: Format code**

Run: `npm run format`

**Step 4: Final commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog with zaps and wallet connect"
```

---

## Summary

This plan implements:

1. **WalletContext** - NWC client state management with localStorage persistence
2. **Zap utilities** - LNURL and NIP-57 helpers
3. **useZap hook** - Complete zap flow (profile lookup → LNURL → invoice → NWC payment)
4. **useVideoZaps hook** - Load and sum zap receipts
5. **WalletConnectDialog** - First-zap onboarding
6. **ZapDialog** - Custom amount selection with presets
7. **ZapButton** - Integrated button with quick-zap and long-press
8. **WalletSection** - Settings page wallet management
9. **Translations** - i18n support

Total: 11 tasks, ~30-40 bite-sized steps
