# Project Overview

This project is a Nostr client application built with React 18.x, TailwindCSS 3.x, Vite, shadcn/ui, and Nostrify.

## Technology Stack

- **React 18.x**: Stable version of React with hooks, concurrent rendering, and improved performance
- **TailwindCSS 3.x**: Utility-first CSS framework for styling
- **Vite**: Fast build tool and development server
- **shadcn/ui**: Unstyled, accessible UI components built with Radix UI and Tailwind
- **Nostrify**: Nostr protocol framework for Deno and web
- **React Router**: For client-side routing with BrowserRouter and ScrollToTop functionality
- **TanStack Query**: For data fetching, caching, and state management
- **TypeScript**: For type-safe JavaScript development

## Project Structure

- `/src/components/`: UI components including NostrProvider for Nostr integration
  - `/src/components/ui/`: shadcn/ui components (48+ components available)
  - `/src/components/auth/`: Authentication-related components (LoginArea, LoginDialog, etc.)
- `/src/hooks/`: Custom hooks including:
  - `useNostr`: Core Nostr protocol integration
  - `useAuthor`: Fetch user profile data by pubkey
  - `useCurrentUser`: Get currently logged-in user
  - `useNostrPublish`: Publish events to Nostr
  - `useUploadFile`: Upload files via Blossom servers
  - `useAppContext`: Access global app configuration
  - `useTheme`: Theme management
  - `useToast`: Toast notifications
  - `useLocalStorage`: Persistent local storage
  - `useLoggedInAccounts`: Manage multiple accounts
  - `useLoginActions`: Authentication actions
  - `useIsMobile`: Responsive design helper
- `/src/pages/`: Page components used by React Router (Index, NotFound)
- `/src/lib/`: Utility functions and shared logic
- `/src/contexts/`: React context providers (AppContext)
- `/src/test/`: Testing utilities including TestApp component
- `/public/`: Static assets
- `App.tsx`: Main app component with provider setup
- `AppRouter.tsx`: React Router configuration

## UI Components

The project uses shadcn/ui components located in `@/components/ui`. These are unstyled, accessible components built with Radix UI and styled with Tailwind CSS. Available components include:

- **Accordion**: Vertically collapsing content panels
- **Alert**: Displays important messages to users
- **AlertDialog**: Modal dialog for critical actions requiring confirmation
- **AspectRatio**: Maintains consistent width-to-height ratio
- **Avatar**: User profile pictures with fallback support
- **Badge**: Small status descriptors for UI elements
- **Breadcrumb**: Navigation aid showing current location in hierarchy
- **Button**: Customizable button with multiple variants and sizes
- **Calendar**: Date picker component 
- **Card**: Container with header, content, and footer sections
- **Carousel**: Slideshow for cycling through elements
- **Chart**: Data visualization component
- **Checkbox**: Selectable input element
- **Collapsible**: Toggle for showing/hiding content
- **Command**: Command palette for keyboard-first interfaces
- **ContextMenu**: Right-click menu component
- **Dialog**: Modal window overlay
- **Drawer**: Side-sliding panel (using vaul)
- **DropdownMenu**: Menu that appears from a trigger element
- **Form**: Form validation and submission handling
- **HoverCard**: Card that appears when hovering over an element
- **InputOTP**: One-time password input field
- **Input**: Text input field
- **Label**: Accessible form labels
- **Menubar**: Horizontal menu with dropdowns
- **NavigationMenu**: Accessible navigation component
- **Pagination**: Controls for navigating between pages
- **Popover**: Floating content triggered by a button
- **Progress**: Progress indicator
- **RadioGroup**: Group of radio inputs
- **Resizable**: Resizable panels and interfaces
- **ScrollArea**: Scrollable container with custom scrollbars
- **Select**: Dropdown selection component
- **Separator**: Visual divider between content
- **Sheet**: Side-anchored dialog component
- **Sidebar**: Navigation sidebar component
- **Skeleton**: Loading placeholder
- **Slider**: Input for selecting a value from a range
- **Sonner**: Toast notification manager
- **Switch**: Toggle switch control
- **Table**: Data table with headers and rows
- **Tabs**: Tabbed interface component
- **Textarea**: Multi-line text input
- **Toast**: Toast notification component
- **ToggleGroup**: Group of toggle buttons
- **Toggle**: Two-state button
- **Tooltip**: Informational text that appears on hover

These components follow a consistent pattern using React's `forwardRef` and use the `cn()` utility for class name merging. Many are built on Radix UI primitives for accessibility and customized with Tailwind CSS.

## Nostr Protocol Integration

This project comes with custom hooks for querying and publishing events on the Nostr network.

### Custom NIP Definition

The file `NIP.md` is used by this project to define a custom Nostr protocol document. If the file doesn't exist, it means this project doesn't have any custom Nostr events associated with it yet. Typically NIPs define custom event kinds.

Before deciding upon a kind number for a custom event, use `nostr__read_nips_index` to see what kinds are currently in use across all NIPs. The kind number determines the event's behavior and storage characteristics:

- **Regular Events** (1 ≤ kind < 10000): Expected to be stored by relays permanently. Used for persistent content like notes, articles, etc.
- **Replaceable Events** (10000 ≤ kind < 20000): Only the latest event per pubkey+kind combination is stored. Used for profile metadata, contact lists, etc.
- **Addressable Events** (30000 ≤ kind < 40000): Identified by pubkey+kind+d-tag combination, only latest per combination is stored. Used for articles, long-form content, etc.

For more detailed information about event structure and behavior, read the `event` protocol page using `nostr__read_protocol`.

**Important**: Whenever new Nostr event kinds are created, if they are not already defined by an existing NIP, the `NIP.md` file in the project must be created or updated to document the custom event structure. Whenever the structure of one of these custom events changes, `NIP.md` must be updated accordingly.

### The `useNostr` Hook

The `useNostr` hook returns an object containing a `nostr` property, with `.query()` and `.event()` methods for querying and publishing Nostr events respectively.

```typescript
import { useNostr } from '@nostrify/react';

function useCustomHook() {
  const { nostr } = useNostr();

  // ...
}
```

### Query Nostr Data with `useNostr` and Tanstack Query

When querying Nostr, the best practice is to create custom hooks that combine `useNostr` and `useQuery` to get the required data.

```typescript
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/query';

function usePosts() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['posts'],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(3000)]);
      const events = await nostr.query([{ kinds: [1], limit: 20 }], { signal });
      return events; // these events could be transformed into another format
    },
  });
}
```

The data may be transformed into a more appropriate format if needed, and multiple calls to `nostr.query()` may be made in a single queryFn.

### The `useAuthor` Hook

To display profile data for a user by their Nostr pubkey (such as an event author), use the `useAuthor` hook.

```tsx
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

function Post({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;

  const displayName = metadata?.display_name ?? metadata?.name ?? genUserName(event.pubkey);
  const profileImage = metadata?.picture;

  // ...render elements with this data
}
```

#### `NostrMetadata` type

```ts
/** Kind 0 metadata. */
interface NostrMetadata {
  /** A short description of the user. */
  about?: string;
  /** A URL to a wide (~1024x768) picture to be optionally displayed in the background of a profile screen. */
  banner?: string;
  /** A boolean to clarify that the content is entirely or partially the result of automation, such as with chatbots or newsfeeds. */
  bot?: boolean;
  /** An alternative, bigger name with richer characters than `name`. `name` should always be set regardless of the presence of `display_name` in the metadata. */
  display_name?: string;
  /** A bech32 lightning address according to NIP-57 and LNURL specifications. */
  lud06?: string;
  /** An email-like lightning address according to NIP-57 and LNURL specifications. */
  lud16?: string;
  /** A short name to be displayed for the user. */
  name?: string;
  /** An email-like Nostr address according to NIP-05. */
  nip05?: string;
  /** A URL to the user's avatar. */
  picture?: string;
  /** A web URL related in any way to the event author. */
  website?: string;
}
```

### The `useNostrPublish` Hook

To publish events, use the `useNostrPublish` hook in this project. This hook automatically adds a "client" tag to published events.

```tsx
import { useState } from 'react';

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from '@/hooks/useNostrPublish';

export function MyComponent() {
  const [ data, setData] = useState<Record<string, string>>({});

  const { user } = useCurrentUser();
  const { mutate: createEvent } = useNostrPublish();

  const handleSubmit = () => {
    createEvent({ kind: 1, content: data.content });
  };

  if (!user) {
    return <span>You must be logged in to use this form.</span>;
  }

  return (
    <form onSubmit={handleSubmit} disabled={!user}>
      {/* ...some input fields */}
    </form>
  );
}
```

The `useCurrentUser` hook should be used to ensure that the user is logged in before they are able to publish Nostr events.

### Nostr Login

To enable login with Nostr, simply use the `LoginArea` component already included in this project.

```tsx
import { LoginArea } from "@/components/auth/LoginArea";

function MyComponent() {
  return (
    <div>
      {/* other components ... */}

      <LoginArea className="max-w-60" />
    </div>
  );
}
```

The `LoginArea` component handles all the login-related UI and interactions, including displaying login dialogs and switching between accounts. It should not be wrapped in any conditional logic.

`LoginArea` displays a "Log in" button when the user is logged out, and changes to an account switcher once the user is logged in. It is an inline-flex element by default. To make it expand to the width of its container, you can pass a className like `flex` (to make it a block element) or `w-full`. If it is left as inline-flex, it's recommended to set a max width.

### `npub`, `naddr`, and other Nostr addresses

Nostr defines a set identifiers in NIP-19. Their prefixes:

- `npub`: public keys
- `nsec`: private keys
- `note`: note ids
- `nprofile`: a nostr profile
- `nevent`: a nostr event
- `naddr`: a nostr replaceable event coordinate
- `nrelay`: a nostr relay (deprecated)

NIP-19 identifiers include a prefix, the number "1", then a base32-encoded data string.

#### Use in Filters

The base Nostr protocol uses hex string identifiers when filtering by event IDs and pubkeys. Nostr filters only accept hex strings.

```ts
// ❌ Wrong: naddr is not decoded
const events = await nostr.query(
  [{ ids: [naddr] }],
  { signal }
);
```

Corrected example:

```ts
// Import nip19 from nostr-tools
import { nip19 } from 'nostr-tools';

// Decode a NIP-19 identifier
const decoded = nip19.decode(value);

// Optional: guard certain types (depending on the use-case)
if (decoded.type !== 'naddr') {
  throw new Error('Unsupported Nostr identifier');
}

// Get the addr object
const naddr = decoded.data;

// ✅ Correct: naddr is expanded into the correct filter
const events = await nostr.query(
  [{
    kinds: [naddr.kind],
    authors: [naddr.pubkey],
    '#d': [naddr.identifier],
  }],
  { signal }
);
```

#### Use in URL Paths

For URL routing, use NIP-19 identifiers as path parameters (e.g., `/:nip19`) to create secure, universal links to Nostr events. Decode the identifier and render the appropriate component based on the type:

- Regular events: Use `/nevent1...` paths
- Replaceable/addressable events: Use `/naddr1...` paths

Always use `naddr` identifiers for addressable events instead of just the `d` tag value, as `naddr` contains the author pubkey needed to create secure filters. This prevents security issues where malicious actors could publish events with the same `d` tag to override content.

```ts
// Secure routing with naddr
const decoded = nip19.decode(params.nip19);
if (decoded.type === 'naddr' && decoded.data.kind === 30024) {
  // Render ArticlePage component
}
```

### Nostr Edit Profile

To include an Edit Profile form, place the `EditProfileForm` component in the project:

```tsx
import { EditProfileForm } from "@/components/EditProfileForm";

function EditProfilePage() {
  return (
    <div>
      {/* you may want to wrap this in a layout or include other components depending on the project ... */}

      <EditProfileForm />
    </div>
  );
}
```

The `EditProfileForm` component displays just the form. It requires no props, and will "just work" automatically.

### Uploading Files on Nostr

Use the `useUploadFile` hook to upload files. This hook uses Blossom servers for file storage and returns NIP-94 compatible tags.

```tsx
import { useUploadFile } from "@/hooks/useUploadFile";

function MyComponent() {
  //const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const handleUpload = async (file: File) => {
    try {
      // Provides an array of NIP-94 compatible tags
      // The first tag in the array contains the URL
      //const [[_, url]] = await uploadFile(file);
      // ...use the url
    } catch (error) {
      // ...handle errors
    }
  };

  // ...rest of component
}
```

To attach files to kind 1 events, each file's URL should be appended to the event's `content`, and an `imeta` tag should be added for each file. For kind 0 events, the URL by itself can be used in relevant fields of the JSON content.

### Nostr Encryption and Decryption

The logged-in user has a `signer` object (matching the NIP-07 signer interface) that can be used for encryption and decryption. The signer's nip44 methods handle all cryptographic operations internally, including key derivation and conversation key management, so you never need direct access to private keys. Always use the signer interface for encryption rather than requesting private keys from users, as this maintains security and follows best practices.

```ts
// Get the current user
const { user } = useCurrentUser();

// Optional guard to check that nip44 is available
if (!user.signer.nip44) {
  throw new Error("Please upgrade your signer extension to a version that supports NIP-44 encryption");
}

// Encrypt message to self
const encrypted = await user.signer.nip44.encrypt(user.pubkey, "hello world");
// Decrypt message to self
const decrypted = await user.signer.nip44.decrypt(user.pubkey, encrypted) // "hello world"
```

### Rendering Rich Text Content

Nostr text notes (kind 1, 11, and 1111) have a plaintext `content` field that may contain URLs, hashtags, and Nostr URIs. These events should render their content using the `NoteContent` component:

```tsx
import { NoteContent } from "@/components/NoteContent";

export function Post(/* ...props */) {
  // ...

  return (
    <CardContent className="pb-2">
      <div className="whitespace-pre-wrap break-words">
        <NoteContent event={post} className="text-sm" />
      </div>
    </CardContent>
  );
}
```

## App Configuration

The project includes an `AppProvider` that manages global application state including theme and relay configuration. The default configuration includes:

```typescript
const defaultConfig: AppConfig = {
  theme: "light",
  relayUrl: "wss://haven.slidestr.net",
};
```

Preset relays are available including Ditto, Nostr.Band, Damus, and Primal. The app uses local storage to persist user preferences.

## Routing

The project uses React Router with a centralized routing configuration in `AppRouter.tsx`. To add new routes:

1. Create your page component in `/src/pages/`
2. Import it in `AppRouter.tsx`
3. Add the route above the catch-all `*` route:

```tsx
<Route path="/your-path" element={<YourComponent />} />
```

The router includes automatic scroll-to-top functionality and a 404 NotFound page for unmatched routes.

## Development Practices

- Uses React Query for data fetching and caching
- Follows shadcn/ui component patterns
- Implements Path Aliases with `@/` prefix for cleaner imports
- Uses Vite for fast development and production builds
- Component-based architecture with React hooks
- Default connection to one Nostr relay for best performance
- Comprehensive provider setup with NostrLoginProvider, QueryClientProvider, and custom AppProvider

## Loading States

**Use skeleton loading** for structured content (feeds, profiles, forms). **Use spinners** only for buttons or short operations.

```tsx
// Skeleton example matching component structure
<Card>
  <CardHeader>
    <div className="flex items-center space-x-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  </CardContent>
</Card>
```

### Empty States and No Content Found

When no content is found (empty search results, no data available, etc.), display a minimalist empty state with the `RelaySelector` component. This allows users to easily switch relays to discover content from different sources.

```tsx
import { RelaySelector } from '@/components/RelaySelector';
import { Card, CardContent } from '@/components/ui/card';

// Empty state example
<div className="col-span-full">
  <Card className="border-dashed">
    <CardContent className="py-12 px-8 text-center">
      <div className="max-w-sm mx-auto space-y-6">
        <p className="text-muted-foreground">
          No results found. Try another relay?
        </p>
        <RelaySelector className="w-full" />
      </div>
    </CardContent>
  </Card>
</div>
```

## Design Customization

**Tailor the site's look and feel based on the user's specific request.** This includes:

- **Color schemes**: Incorporate the user's color preferences when specified, and choose an appropriate scheme that matches the application's purpose and aesthetic
- **Typography**: Choose fonts that match the requested aesthetic (modern, elegant, playful, etc.)
- **Layout**: Follow the requested structure (3-column, sidebar, grid, etc.)
- **Component styling**: Use appropriate border radius, shadows, and spacing for the desired feel
- **Interactive elements**: Style buttons, forms, and hover states to match the theme

### Adding Fonts

To add custom fonts, follow these steps:

1. **Install a font package** using the npm_add_package tool:
   
   **Any Google Font can be installed** using the @fontsource packages. Examples:
   - For Inter Variable: `npm_add_package({ name: "@fontsource-variable/inter" })`
   - For Roboto: `npm_add_package({ name: "@fontsource/roboto" })`
   - For Outfit Variable: `npm_add_package({ name: "@fontsource-variable/outfit" })`
   - For Poppins: `npm_add_package({ name: "@fontsource/poppins" })`
   - For Open Sans: `npm_add_package({ name: "@fontsource/open-sans" })`
   
   **Format**: `@fontsource/[font-name]` or `@fontsource-variable/[font-name]` (for variable fonts)

2. **Import the font** in `src/main.tsx`:
   ```typescript
   import '@fontsource-variable/inter';
   ```

3. **Update Tailwind configuration** in `tailwind.config.ts`:
   ```typescript
   export default {
     theme: {
       extend: {
         fontFamily: {
           sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
         },
       },
     },
   }
   ```

### Recommended Font Choices by Use Case

- **Modern/Clean**: Inter Variable, Outfit Variable, or Manrope
- **Professional/Corporate**: Roboto, Open Sans, or Source Sans Pro  
- **Creative/Artistic**: Poppins, Nunito, or Comfortaa
- **Technical/Code**: JetBrains Mono, Fira Code, or Source Code Pro (for monospace)

### Theme System

The project includes a complete light/dark theme system using CSS custom properties. The theme can be controlled via:

- `useTheme` hook for programmatic theme switching
- CSS custom properties defined in `src/index.css`
- Automatic dark mode support with `.dark` class

### Color Scheme Implementation

When users specify color schemes:
- Update CSS custom properties in `src/index.css` (both `:root` and `.dark` selectors)
- Use Tailwind's color palette or define custom colors
- Ensure proper contrast ratios for accessibility
- Apply colors consistently across components (buttons, links, accents)
- Test both light and dark mode variants

### Component Styling Patterns

- Use `cn()` utility for conditional class merging
- Follow shadcn/ui patterns for component variants
- Implement responsive design with Tailwind breakpoints
- Add hover and focus states for interactive elements

## Writing Tests

**Important for AI Assistants**: Only create tests when the user is experiencing a specific problem or explicitly requests tests. Do not proactively write tests for new features or components unless the user is having issues that require testing to diagnose or resolve.

### Test Setup

The project uses Vitest with jsdom environment and includes comprehensive test setup:

- **Testing Library**: React Testing Library with jest-dom matchers
- **Test Environment**: jsdom with mocked browser APIs (matchMedia, scrollTo, IntersectionObserver, ResizeObserver)
- **Test App**: `TestApp` component provides all necessary context providers for testing

The project includes a `TestApp` component that provides all necessary context providers for testing. Wrap components with this component to provide required context providers:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(
      <TestApp>
        <MyComponent />
      </TestApp>
    );

    expect(screen.getByText('Expected text')).toBeInTheDocument();
  });
});
```

## Testing Your Changes

Whenever you modify code, you must run the **test** script using the **run_script** tool.

**Your task is not considered finished until this test passes without errors.**