# Project Overview

Nostr client application built with React 18.x, TailwindCSS 3.x, Vite, shadcn/ui, and Applesauce.

## Technology Stack

- **React 18.x**, **TailwindCSS 3.x**, **Vite**, **TypeScript**
- **shadcn/ui**: Accessible UI components (48+ available in `/src/components/ui/`)
- **Applesauce**: Nostr protocol framework (EventStore, RelayPool, Loaders, React integration)
- **React Router**, **TanStack Query**: Routing and state management

## Context7 MCP Integration

Context7 provides up-to-date library documentation. Applesauce is fully indexed with 111k+ tokens, 459 code snippets, and 72 pages.

**Setup:**

```bash
# Remote (Recommended)
claude mcp add --transport http context7 https://mcp.context7.com/mcp

# Local with API key (higher rate limits)
claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key YOUR_API_KEY
```

**Links:**

- Applesauce: https://context7.com/hzrd149/applesauce
- Docs: https://hzrd149.github.io/applesauce/

## Project Structure

- `/src/components/`: UI components
  - `/ui/`: shadcn/ui components
  - `/auth/`: LoginArea, LoginDialog
- `/src/hooks/`: useAuthor, useCurrentUser, useNostrPublish, useUploadFile, useAppContext, useTheme, etc.
- `/src/pages/`: Page components
- `/src/lib/`: Utilities
- `/src/contexts/`: AppContext
- `App.tsx`, `AppRouter.tsx`: Main app and routing

## Applesauce (Nostr Integration)

**Core packages:** Core, Relay, Loaders, React, Accounts, Signers, Factory, Actions, Content, Wallet, SQLite

**Key hooks:** `useEventStore`, `useObservableMemo`, `useEventModel`, `useActiveAccount`, `useAccountManager`

**Loaders:** `createTimelineLoader`, `createAddressLoader`, `createEventLoader`

**Models:** `ContactsModel`, `ReactionsModel`, `UserBlossomServersModel`

### Core Setup (src/nostr/core.ts)

```typescript
import { EventStore } from 'applesauce-core'
import { RelayPool } from 'applesauce-relay'

export const eventStore = new EventStore() // Singleton
export const relayPool = new RelayPool() // Singleton
```

### Provider Setup (App.tsx)

```tsx
import { AccountsProvider, EventStoreProvider, FactoryProvider } from 'applesauce-react/providers'
import { AccountManager } from 'applesauce-accounts'
import { EventFactory } from 'applesauce-factory'

const accountManager = new AccountManager()
const factory = new EventFactory({ signer: accountManager.signer })

<AccountsProvider manager={accountManager}>
  <EventStoreProvider eventStore={eventStore}>
    <FactoryProvider factory={factory}>
      {children}
    </FactoryProvider>
  </EventStoreProvider>
</AccountsProvider>
```

### Key Patterns

**Profile data:**

```tsx
import { useObservableMemo } from 'applesauce-react/hooks'
const profile = useObservableMemo(() => eventStore.profile(pubkey), [pubkey])
```

**Timeline loading:**

```tsx
import { createTimelineLoader } from 'applesauce-loaders/loaders'
const loader = createTimelineLoader(relayPool, relays, { kinds: [1] }, { eventStore })
loader.load().subscribe(events => setEvents(prev => [...prev, ...events]))
```

**Models:**

```tsx
import { useEventModel } from 'applesauce-react/hooks'
import { ContactsModel } from 'applesauce-core/models'
const contacts = useEventModel(ContactsModel, pubkey)
```

### Best Practices

1. **Singleton Pattern**: One EventStore and RelayPool per app (avoid duplicates)
2. **Cache-First Loading**: Use cache functions in loaders
3. **Observable Cleanup**: Use `useObservableMemo` (auto-cleanup) or manually unsubscribe
4. **Provider Order**: AccountsProvider → EventStoreProvider → FactoryProvider

### Migration Note

This project migrated from Nostrify to Applesauce. The old `useNostr` hook is deprecated. Use applesauce hooks instead.

## Custom Hooks

### useAuthor

```tsx
import { useAuthor } from '@/hooks/useAuthor'
const author = useAuthor(pubkey)
const displayName =
  author.data?.metadata?.display_name ?? author.data?.metadata?.name ?? genUserName(pubkey)
```

### useCurrentUser & useNostrPublish

```tsx
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useNostrPublish } from '@/hooks/useNostrPublish'

const { user } = useCurrentUser()
const { mutate: createEvent } = useNostrPublish()

if (user) {
  createEvent({ kind: 1, content: 'Hello' })
}
```

### useUploadFile

```tsx
import { useUploadFile } from '@/hooks/useUploadFile'
const { mutateAsync: uploadFile, isPending } = useUploadFile()
const [[_, url]] = await uploadFile(file) // Returns NIP-94 tags
```

## Nostr Components

### Login

```tsx
import { LoginArea } from '@/components/auth/LoginArea'
;<LoginArea className="max-w-60" />
```

Shows "Log in" when logged out, account switcher when logged in.

### Rich Text Content

```tsx
import { NoteContent } from '@/components/NoteContent'
;<NoteContent event={post} className="text-sm" />
```

Renders plaintext content with URLs, hashtags, and Nostr URIs.

## NIP-19 Identifiers

Prefixes: `npub` (pubkey), `nsec` (private key), `note` (event), `nprofile`, `nevent`, `naddr`, `nrelay`

**Decoding for filters:**

```ts
import { nip19 } from 'nostr-tools'
const decoded = nip19.decode(value)
if (decoded.type === 'naddr') {
  const { kind, pubkey, identifier } = decoded.data
  // Use in filter: { kinds: [kind], authors: [pubkey], '#d': [identifier] }
}
```

**URL routing:** Use `/naddr1...` or `/nevent1...` paths. Always decode and validate.

## Custom NIP Definition

`NIP.md` defines custom Nostr event kinds for this project. Update when adding/changing custom events.

**Kind ranges:**

- Regular (1-9999): Stored permanently
- Replaceable (10000-19999): Latest per pubkey+kind
- Addressable (30000-39999): Latest per pubkey+kind+d-tag

Use `nostr__read_nips_index` to check existing kinds.

## Encryption/Decryption

```ts
const { user } = useCurrentUser()
if (!user.signer.nip44) throw new Error('NIP-44 not supported')
const encrypted = await user.signer.nip44.encrypt(pubkey, 'message')
const decrypted = await user.signer.nip44.decrypt(pubkey, encrypted)
```

## Routing

React Router with centralized config in `AppRouter.tsx`. Add routes above the catch-all `*` route.

## Loading States

**Use skeleton loading** for structured content. **Use spinners** only for buttons.

```tsx
<Skeleton className="h-10 w-10 rounded-full" />
```

### Empty States

```tsx
import { RelaySelector } from '@/components/RelaySelector'
;<Card className="border-dashed">
  <CardContent className="py-12 text-center">
    <p className="text-muted-foreground">No results found. Try another relay?</p>
    <RelaySelector className="w-full" />
  </CardContent>
</Card>
```

## Design Customization

Tailor color schemes, typography, layout, and component styling based on user requests.

### Adding Fonts

1. Install: `@fontsource/[font-name]` or `@fontsource-variable/[font-name]`
2. Import in `src/main.tsx`
3. Update `tailwind.config.ts` fontFamily

**Recommendations:**

- Modern/Clean: Inter Variable, Outfit Variable
- Professional: Roboto, Open Sans
- Creative: Poppins, Nunito
- Technical: JetBrains Mono, Fira Code

### Theme System

Use `useTheme` hook. CSS custom properties in `src/index.css`. Supports light/dark mode with `.dark` class.

## Error Handling

### Error Boundary

Wrap components with `ErrorBoundary` to catch and handle errors gracefully:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary'
;<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>
```

### Async Error Handling

Use `useAsyncError` hook for consistent async error handling with retry logic:

```tsx
import { useAsyncError } from '@/hooks/useAsyncError'

const [execute, { error, isError, retry }] = useAsyncError(async () => await someAsyncOperation(), {
  maxRetries: 3,
})
```

### Error Messages

Display user-friendly error messages with `ErrorMessage` component:

```tsx
import { ErrorMessage } from '@/components/ErrorMessage'
import { handleError } from '@/lib/error-utils'

try {
  // your code
} catch (err) {
  const appError = handleError(err, 'ComponentName')
  return <ErrorMessage error={appError} onRetry={retry} />
}
```

## Performance Best Practices

### Component Optimization

- **Use React.memo** for frequently rendered list items (VideoCard, CommentItem, etc.)
- **Check EventStore before relay requests** using `eventStore.hasReplaceable(kind, pubkey)`
- **Memoize expensive computations** with `useMemo` and `useCallback`
- **Lazy load routes** (already implemented in `AppRouter.tsx`)

### Bundle Optimization

- Routes are lazy-loaded for optimal initial load time
- Vendor chunks are split strategically (see `vite.config.ts`)
- Console.log statements are removed in production builds
- Source maps are disabled in production for smaller bundles

## Testing

**Only create tests when user experiences problems or explicitly requests them.**

Use `TestApp` component for context providers:

```tsx
import { TestApp } from '@/test/TestApp'
render(
  <TestApp>
    <MyComponent />
  </TestApp>
)
```

**Run tests after changes:** Use the test script. Task not finished until tests pass.
