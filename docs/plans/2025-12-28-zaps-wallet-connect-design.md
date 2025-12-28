# Zaps & Wallet Connect Design

## Overview

Implement lightning zaps for video events using NIP-57 (Lightning Zaps) and NIP-47 (Nostr Wallet Connect) via the `applesauce-wallet-connect` package.

## User Experience

- **Quick zap**: Single click sends 21 sats instantly
- **Custom zap**: Long-press/right-click opens dialog with preset amounts (21, 100, 500, 1000, 5000) + custom input
- **Zap button**: Placed next to like/dislike buttons
- **Zap stats**: Shows total sats received (e.g., "21.5k")

## Wallet Connection

- **Settings page**: New "Wallet" section with NWC connection string input
- **First-zap onboarding**: Prompt to connect wallet when user tries to zap without one
- **Storage**: NWC URI stored in localStorage

## Architecture

### New Dependencies

```bash
npm install applesauce-wallet-connect
```

### New Files

```
src/contexts/WalletContext.tsx        # Wallet connection state + NWC client
src/hooks/useWallet.ts                # Hook to access wallet context
src/hooks/useZap.ts                   # Zap creation + sending logic
src/hooks/useVideoZaps.ts             # Load zap receipts for a video
src/components/ZapButton.tsx          # Button with quick-zap + long-press
src/components/ZapDialog.tsx          # Custom amount dialog with presets
src/components/WalletConnectDialog.tsx    # NWC connection onboarding
src/components/settings/WalletSection.tsx # Settings page wallet config
```

### Data Flow

1. User connects wallet via NWC URI → stored in localStorage
2. `WalletContext` initializes `WalletConnect` client on app load
3. Zap button uses `useZap` hook which creates NIP-57 zap request → pays via NWC
4. Zap receipts (kind 9735) loaded via `useVideoZaps` to show totals

## Wallet Context

```typescript
interface WalletState {
  isConnected: boolean
  isConnecting: boolean
  balance: number | null        // msats, fetched on connect
  walletInfo: WalletInfo | null // alias, supported methods
  error: string | null
}
```

### Connection Flow

- NWC URI format: `nostr+walletconnect://<wallet-pubkey>?relay=<relay-url>&secret=<secret-key>`
- On app start, attempt to restore connection from localStorage
- Settings page: input for NWC string, connect/disconnect buttons
- First-zap: dialog prompts for wallet if not connected

## Zap Flow (NIP-57)

### Quick Zap (single click)

1. User clicks zap button
2. If no wallet → open `WalletConnectDialog`, then continue
3. Fetch recipient's lightning address from profile (`lud16` or `lud06`)
4. If no lightning address → show toast "Author can't receive zaps"
5. Create kind 9734 zap request with amount (21 sats)
6. GET to LNURL callback with zap request → receive bolt11 invoice
7. Call `wallet.payInvoice(bolt11)` via NWC
8. Show success toast

### Custom Zap (long-press / right-click)

1. Open `ZapDialog` with preset buttons: 21, 100, 500, 1000, 5000
2. Custom input field for arbitrary amount
3. Optional comment field (max 140 chars)
4. "Zap" button triggers same flow with chosen amount

### Zap Request Tags (kind 9734)

```typescript
[
  ['relays', ...writeRelays],
  ['amount', millisats.toString()],
  ['p', recipientPubkey],
  ['e', videoEventId],
  ['k', videoEventKind],  // 34235 or 34236
]
```

## Displaying Zap Stats

### Loading Zap Receipts

- `useVideoZaps(eventId)` queries for kind 9735 with `#e: [eventId]`
- Parse bolt11 from each receipt to extract amount

### Display Format

- Under 1000: show as-is (e.g., "210")
- 1000-999999: show as "k" (e.g., "21.5k")
- 1M+: show as "M" (e.g., "1.2M")

## UI Components

### ZapButton

```typescript
interface ZapButtonProps {
  eventId: string
  kind: number
  authorPubkey: string
  layout: 'vertical' | 'inline'
}
```

- Click → quick zap (21 sats)
- Long-press (500ms) or right-click → open ZapDialog
- Loading spinner during payment
- Disabled if user is the author

### ZapDialog

- Preset amount buttons in grid
- Custom amount input
- Optional comment textarea (140 char limit)
- Shows recipient name + avatar

### WalletConnectDialog

- NWC URI input field
- Link to Alby for getting NWC connection
- Connect button validates and stores

### WalletSection (settings)

- Disconnected: URI input + Connect button
- Connected: wallet alias, balance, Disconnect button

## Error Handling

- Wallet not connected → onboarding dialog
- No lightning address → toast "Author can't receive zaps"
- Payment failed → toast with error
- Insufficient balance → toast "Insufficient funds"

## Edge Cases

- Author has no lightning address → button disabled with tooltip
- NWC connection drops → auto-reconnect on next zap
- Multiple zaps to same video → allowed, totals accumulate
- Stale balance → refresh after each payment

## Validation

- NWC URI must start with `nostr+walletconnect://`
- Amount ≥ 1 sat
- Comment ≤ 140 characters

## Accessibility

- Long-press alternative: right-click on desktop
- Keyboard: Enter for quick zap, Shift+Enter for dialog
- ARIA labels for screen readers
