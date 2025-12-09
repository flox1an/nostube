# Blossom Server Onboarding Design

**Date:** 2025-12-09
**Status:** Approved
**Authors:** Design brainstorming session

## Overview

Extend the onboarding dialog with a beginner-friendly Blossom server chooser. This allows new users to configure upload and mirror servers during their first login, ensuring they have a working upload configuration from the start.

## Goals

1. Provide a beginner-friendly interface for configuring Blossom servers
2. Pre-select reliable free servers as defaults
3. Educate users about upload vs mirror servers
4. Ensure every user has a working upload configuration
5. Maintain consistency with existing onboarding flow

## Architecture & Flow

### Multi-Step Dialog Structure

The existing `FollowImportDialog` will be refactored into `OnboardingDialog` with a step-based architecture:

- **Step 1**: Follow Import (existing functionality, unchanged)
- **Step 2**: Blossom Server Configuration (new)

### State Management

- Add `currentStep` state (1 or 2)
- Separate localStorage keys:
  - `nostube_onboarding_follow_import` - tracks follow import completion
  - `nostube_onboarding_blossom_config` - tracks Blossom config completion
  - Only mark overall onboarding complete when both steps are done

### Navigation Flow

1. Dialog opens on Step 1 (follow import) for users with kind 3 but no kind 30000
2. After "Import" or "Skip" on Step 1 → advance to Step 2
3. Step 2 shows Blossom server configuration with pre-selected servers
4. "Continue" button on Step 2 saves configuration and closes dialog
5. Users who already completed Step 1 previously will skip directly to Step 2

### Conditional Display

- Step 1 only shows if user has kind 3 contacts but no kind 30000 follow set
- Step 2 always shows for first-time users (unless they have servers already configured)

## Component Structure

### Component Hierarchy

```
OnboardingDialog (refactored from FollowImportDialog)
├── Step 1: FollowImportStep (existing content extracted)
└── Step 2: BlossomServerConfigStep (new)
    ├── UploadServersSection
    │   └── ServerCheckboxList
    │       └── ServerCard (multiple)
    └── MirrorServersSection
        └── ServerCheckboxList
            └── ServerCard (multiple)
```

### Data Model

**New file:** `src/lib/blossom-servers.ts`

```typescript
export interface BlossomServerInfo {
  url: string
  name: string
  status: 'ok' | 'warning' | 'error' | 'todo'
  cdnProvider?: string
  supportsMirror: boolean
  maxFileSize?: string
  retention?: string
  payment: 'free' | 'paid'
  price?: string // e.g., "$0.05/GB/Month"
  notes?: string
}

export const RECOMMENDED_BLOSSOM_SERVERS: BlossomServerInfo[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'almond.slidestr.net',
    status: 'ok',
    supportsMirror: true,
    payment: 'free',
    notes: 'Supports chunked upload',
  },
  {
    url: 'https://blossom.primal.net',
    name: 'blossom.primal.net',
    status: 'ok',
    cdnProvider: 'Bunny Net',
    supportsMirror: false,
    payment: 'free',
  },
  {
    url: 'https://24242.io',
    name: '24242.io',
    status: 'ok',
    cdnProvider: 'BunnyCDN',
    supportsMirror: false,
    maxFileSize: '100MB',
    retention: '60 days',
    payment: 'free',
  },
  {
    url: 'https://blossom.band',
    name: 'blossom.band',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment. Extension: X-Moderation',
  },
  {
    url: 'https://blossom.sector01.com',
    name: 'blossom.sector01.com',
    status: 'ok',
    supportsMirror: false,
    payment: 'free',
  },
  {
    url: 'https://cdn.satellite.earth',
    name: 'cdn.satellite.earth',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment',
  },
  // Note: cdn.nostrcheck.me and nostr.download are intentionally excluded (blocked/errored)
]
```

### Pre-selected Defaults

- **Upload**: `['https://almond.slidestr.net']` (1 server)
- **Mirror**: `['https://blossom.primal.net', 'https://24242.io']` (2 servers)

Rationale:

- almond.slidestr.net: Supports chunked upload and mirroring, reliable
- blossom.primal.net: CDN-backed, good global coverage
- 24242.io: BunnyCDN for additional redundancy

## UI Layout & Visual Design

### Step 2: BlossomServerConfigStep Layout

```
┌─────────────────────────────────────────┐
│ Configure Upload Servers                │
│ ─────────────────────────────────────── │
│                                         │
│ Choose where to upload your videos.     │
│ Select at least one server.             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ╔═══════════════════════════════════╗│ │  <- ScrollArea
│ │ ║ ☑ almond.slidestr.net       Free ║│ │     max-h-64
│ │ ║   ✓ Supports mirroring            ║│ │     (~256px)
│ │ ║   📦 No size limit • ∞ retention  ║│ │
│ │ ║                                   ║│ │
│ │ ║ ☐ blossom.band              Paid ║│ │
│ │ ║   ✓ Supports mirroring            ║│ │
│ │ ║   📦 No limit • $0.05/GB/Month    ║│ │
│ │ ║                                   ║│ │
│ │ ║ ☐ blossom.sector01.com      Free ║│ │
│ │ ║   ...                             ║│ │
│ │ ║ [scrollable if >3-4 servers]      ║│ │
│ │ ╚═══════════════════════════════════╝│ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Configure Mirror Servers (Optional)     │
│ ─────────────────────────────────────── │
│                                         │
│ Add backup servers for redundancy.      │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ╔═══════════════════════════════════╗│ │  <- ScrollArea
│ │ ║ ☑ blossom.primal.net        Free ║│ │     max-h-48
│ │ ║   ✓ Supports mirroring • Bunny   ║│ │     (~192px)
│ │ ║   📦 No size limit • ∞ retention  ║│ │
│ │ ║                                   ║│ │
│ │ ║ ☑ 24242.io                  Free ║│ │
│ │ ║   [scrollable if >2-3 servers]    ║│ │
│ │ ╚═══════════════════════════════════╝│ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

     Step 2 of 2

          [Continue] (disabled if no upload)
```

### ServerCard Component Features

- Checkbox aligned left
- Server name + payment badge (Free/Paid) on first line
- Icon + feature line (mirroring support, CDN if available)
- Icon + limits line (file size, retention, price)
- Card background with hover state
- Checked cards get subtle highlight border (purple accent)
- Responsive: stacks info on mobile

### Server Information Display

Display moderate level of detail:

- Server name
- Status (icon only, no text for OK status)
- Payment tier (Free/Paid badge)
- Max file size (if limited)
- Retention period (if limited)
- Whether it supports mirroring
- CDN provider (if available)
- Price (for paid servers)

### Scrolling

- Use shadcn `ScrollArea` component (consistent with BlossomServersSection)
- Upload section: `max-h-64` (~4 servers visible, scroll for more)
- Mirror section: `max-h-48` (~3 servers visible, scroll for more)
- Maintains reasonable dialog height on mobile

## State Management & Data Flow

### Local State in BlossomServerConfigStep

```typescript
const [selectedUploadServers, setSelectedUploadServers] = useState<string[]>([
  'https://almond.slidestr.net',
])
const [selectedMirrorServers, setSelectedMirrorServers] = useState<string[]>([
  'https://blossom.primal.net',
  'https://24242.io',
])
```

### Server Selection Logic

- **Upload servers**: Multiple checkboxes allowed (if primary fails, try next)
- **Mirror servers**: Multiple checkboxes allowed (select 0-many for redundancy)
- Pre-select defaults on component mount

### Saving to AppContext

When user clicks "Continue":

```typescript
const handleContinue = () => {
  // Convert selections to BlossomServer format
  const blossomServers = [
    ...selectedUploadServers.map(url => ({
      url,
      name: deriveServerName(url),
      tags: ['initial upload'] as BlossomServerTag[],
    })),
    ...selectedMirrorServers.map(url => ({
      url,
      name: deriveServerName(url),
      tags: ['mirror'] as BlossomServerTag[],
    })),
  ]

  // Save to config
  updateConfig(current => ({
    ...current,
    blossomServers,
  }))

  // Mark onboarding complete
  localStorage.setItem('nostube_onboarding_blossom_config', 'completed')

  // Close dialog
  onClose()
}
```

### Validation

- At least one upload server must be selected
- "Continue" button disabled if no upload servers selected
- Mirror servers are optional (can be empty array)
- Show helper text when validation fails: "At least one upload server is required"

### Integration with Existing Settings

- Uses same `BlossomServer` type and config structure from AppContext
- Users can later modify in Settings → BlossomServersSection
- Pre-populated servers respect blocked server list (no cdn.nostrcheck.me)
- If server appears in both upload and mirror selections, prefer 'initial upload' tag

## Internationalization (i18n)

Add translation keys to all 4 languages: EN, DE, FR, ES

### Translation Structure

```json
{
  "onboarding": {
    "blossom": {
      "title": "Configure Upload Servers",
      "uploadSection": {
        "title": "Upload Servers",
        "description": "Choose where to upload your videos. Select at least one server.",
        "required": "At least one upload server is required"
      },
      "mirrorSection": {
        "title": "Mirror Servers (Optional)",
        "description": "Add backup servers for redundancy and faster global access."
      },
      "serverInfo": {
        "free": "Free",
        "paid": "Paid",
        "supportsMirror": "Supports mirroring",
        "maxSize": "Max size",
        "retention": "Retention",
        "unlimited": "Unlimited",
        "noLimit": "No limit"
      },
      "continue": "Continue",
      "stepIndicator": "Step {{current}} of {{total}}"
    }
  }
}
```

### German (de.json)

```json
{
  "onboarding": {
    "blossom": {
      "title": "Upload-Server konfigurieren",
      "uploadSection": {
        "title": "Upload-Server",
        "description": "Wählen Sie, wo Sie Ihre Videos hochladen möchten. Mindestens einen Server auswählen.",
        "required": "Mindestens ein Upload-Server ist erforderlich"
      },
      "mirrorSection": {
        "title": "Mirror-Server (Optional)",
        "description": "Backup-Server für Redundanz und schnelleren globalen Zugriff hinzufügen."
      },
      "serverInfo": {
        "free": "Kostenlos",
        "paid": "Bezahlt",
        "supportsMirror": "Unterstützt Spiegelung",
        "maxSize": "Max. Größe",
        "retention": "Aufbewahrung",
        "unlimited": "Unbegrenzt",
        "noLimit": "Kein Limit"
      },
      "continue": "Weiter",
      "stepIndicator": "Schritt {{current}} von {{total}}"
    }
  }
}
```

### French (fr.json)

```json
{
  "onboarding": {
    "blossom": {
      "title": "Configurer les serveurs de téléchargement",
      "uploadSection": {
        "title": "Serveurs de téléchargement",
        "description": "Choisissez où télécharger vos vidéos. Sélectionnez au moins un serveur.",
        "required": "Au moins un serveur de téléchargement est requis"
      },
      "mirrorSection": {
        "title": "Serveurs miroirs (Optionnel)",
        "description": "Ajoutez des serveurs de sauvegarde pour la redondance et un accès mondial plus rapide."
      },
      "serverInfo": {
        "free": "Gratuit",
        "paid": "Payant",
        "supportsMirror": "Supporte la mise en miroir",
        "maxSize": "Taille max",
        "retention": "Rétention",
        "unlimited": "Illimité",
        "noLimit": "Aucune limite"
      },
      "continue": "Continuer",
      "stepIndicator": "Étape {{current}} sur {{total}}"
    }
  }
}
```

### Spanish (es.json)

```json
{
  "onboarding": {
    "blossom": {
      "title": "Configurar servidores de carga",
      "uploadSection": {
        "title": "Servidores de carga",
        "description": "Elija dónde cargar sus videos. Seleccione al menos un servidor.",
        "required": "Se requiere al menos un servidor de carga"
      },
      "mirrorSection": {
        "title": "Servidores espejo (Opcional)",
        "description": "Agregue servidores de respaldo para redundancia y acceso global más rápido."
      },
      "serverInfo": {
        "free": "Gratis",
        "paid": "De pago",
        "supportsMirror": "Admite duplicación",
        "maxSize": "Tamaño máx",
        "retention": "Retención",
        "unlimited": "Ilimitado",
        "noLimit": "Sin límite"
      },
      "continue": "Continuar",
      "stepIndicator": "Paso {{current}} de {{total}}"
    }
  }
}
```

## Error Handling

### Error Scenarios

1. **No servers available** (all blocked/errored):
   - Show message: "No servers available. You can add custom servers in Settings later."
   - Allow continuing with empty config
   - Log warning to console

2. **Network issues loading server list**:
   - Graceful fallback to hardcoded RECOMMENDED_BLOSSOM_SERVERS
   - Log error silently (no user-facing error)

3. **User deselects all upload servers**:
   - Disable "Continue" button
   - Show helper text in red: "At least one upload server is required"
   - Allow re-selection

4. **Save to config fails**:
   - Show toast error message: "Failed to save configuration. Please try again."
   - Don't close dialog
   - Allow user to retry
   - Log full error to console

### Edge Cases

- **Filter blocked servers**: Exclude cdn.nostrcheck.me (re-encodes videos) and nostr.download (CORS issues) from display
- **Users with existing config**: Skip Step 2 entirely if `config.blossomServers` already has entries
- **Duplicate server selection**: If same server selected for both upload and mirror, only add once with 'initial upload' tag
- **URL normalization**: Use existing `normalizeServerUrl()` helper to ensure consistent format
- **Empty mirror selection**: Totally valid, don't show any warning

## Testing Strategy

### Unit Tests

**`src/lib/blossom-servers.test.ts`:**

- Parse server data correctly
- Filter blocked servers (cdn.nostrcheck.me, nostr.download)
- Derive server names from URLs
- Validate BlossomServerInfo structure
- Handle edge cases (missing fields, invalid URLs)

**`src/components/onboarding/BlossomServerConfigStep.test.tsx`:**

- ✓ Pre-selects default servers on mount (1 upload, 2 mirror)
- ✓ Toggles server selection for upload section
- ✓ Toggles server selection for mirror section
- ✓ Disables Continue when no upload servers selected
- ✓ Enables Continue when ≥1 upload server selected
- ✓ Handles empty mirror selection (valid case)
- ✓ Respects blocked server list
- ✓ Converts selections to correct BlossomServer format on save
- ✓ Calls updateConfig with correct structure
- ✓ Sets localStorage flag on completion
- ✓ Shows validation message when no upload servers

**`src/components/OnboardingDialog.test.tsx`:**

- ✓ Shows Step 1 for users with kind 3 but no kind 30000
- ✓ Advances to Step 2 after Step 1 "Import"
- ✓ Advances to Step 2 after Step 1 "Skip"
- ✓ Skips Step 1 if already completed (localStorage check)
- ✓ Shows Step 2 for new users
- ✓ Skips Step 2 if servers already configured
- ✓ Saves correct config format on Continue
- ✓ Sets both localStorage flags correctly
- ✓ Closes dialog after Step 2 completion
- ✓ Step indicator shows "Step 1 of 2" and "Step 2 of 2"

**`src/components/onboarding/ServerCard.test.tsx`:**

- ✓ Renders server name and payment badge
- ✓ Shows "Supports mirroring" for capable servers
- ✓ Shows CDN provider when available
- ✓ Shows file size limits when specified
- ✓ Shows retention period when specified
- ✓ Shows price for paid servers
- ✓ Handles checkbox state changes
- ✓ Applies highlight style when checked
- ✓ Shows "Unlimited" / "No limit" for unlimited servers

### Integration Tests

**Full onboarding flow:**

1. New user logs in → sees Step 1 (follow import)
2. User imports follows → advances to Step 2 (Blossom config)
3. Sees pre-selected servers (1 upload, 2 mirror)
4. Clicks Continue → config saved to AppContext
5. Dialog closes
6. User re-logs in → onboarding doesn't show again

**Settings integration:**

1. Complete onboarding with default servers
2. Navigate to Settings → Blossom Servers Section
3. Verify servers appear with correct tags
4. Modify tags in Settings
5. Add/remove servers in Settings
6. Verify changes persist

**Edge case: Existing server config:**

1. User already has blossom servers configured
2. Logs in → onboarding shows Step 1 only (if needed)
3. Step 2 is automatically skipped
4. Existing server config remains unchanged

### Test Data

Mock data for tests:

```typescript
const mockBlossomServers: BlossomServerInfo[] = [
  {
    url: 'https://test-upload.example.com',
    name: 'test-upload.example.com',
    status: 'ok',
    supportsMirror: true,
    payment: 'free',
  },
  {
    url: 'https://test-mirror1.example.com',
    name: 'test-mirror1.example.com',
    status: 'ok',
    supportsMirror: false,
    payment: 'free',
    maxFileSize: '100MB',
    retention: '30 days',
  },
  {
    url: 'https://test-mirror2.example.com',
    name: 'test-mirror2.example.com',
    status: 'ok',
    supportsMirror: false,
    payment: 'paid',
    price: '$0.10/GB/Month',
  },
]
```

## Implementation Notes

### File Structure

```
src/
├── components/
│   ├── OnboardingDialog.tsx (refactored from FollowImportDialog)
│   ├── onboarding/
│   │   ├── FollowImportStep.tsx (extracted from old dialog)
│   │   ├── BlossomServerConfigStep.tsx (new)
│   │   └── ServerCard.tsx (new, reusable component)
├── lib/
│   └── blossom-servers.ts (new - server data & helpers)
├── i18n/locales/
│   ├── en.json (add onboarding.blossom.*)
│   ├── de.json
│   ├── fr.json
│   └── es.json
└── test/
    └── onboarding/
        ├── OnboardingDialog.test.tsx
        ├── BlossomServerConfigStep.test.tsx
        ├── ServerCard.test.tsx
        └── blossom-servers.test.ts
```

### Migration Strategy

**Backwards Compatibility:**

1. Users who completed old follow import:
   - localStorage key `nostube_onboarding_follow_import` exists
   - They'll see only Step 2 (Blossom config) on next login
   - After completing Step 2, full onboarding is marked complete

2. Users with existing blossom servers:
   - Check `config.blossomServers?.length > 0`
   - Skip Step 2 entirely (no need to reconfigure)

3. Fresh users:
   - See both Step 1 and Step 2
   - Complete full onboarding flow

**Component Rename:**

- Rename `FollowImportDialog` → `OnboardingDialog`
- Update import in `App.tsx`:
  ```typescript
  - import { FollowImportDialog } from '@/components/FollowImportDialog'
  + import { OnboardingDialog } from '@/components/OnboardingDialog'
  ```
- Keep old localStorage key for Step 1 to avoid breaking existing users

### Performance Considerations

- Server list is static (parsed once from blossom-servers.md, hardcoded in TypeScript)
- No API calls needed (all data hardcoded in RECOMMENDED_BLOSSOM_SERVERS)
- ScrollArea component handles virtualization if server list grows
- Checkbox state changes are local (no config updates until Continue clicked)
- Minimal re-renders: only update state on user interaction

### Accessibility (a11y)

- **Semantic HTML**: Use `<fieldset>` and `<legend>` for server groups
- **Checkbox labels**: Properly associated with `htmlFor` attribute
- **Keyboard navigation**: Tab through servers, Space to toggle selection
- **Focus management**: Clear focus states on cards (ring-2 ring-purple-500)
- **Screen readers**:
  - Step indicator announced: "Step 2 of 2"
  - Section headings properly structured (h2, h3)
  - Validation errors announced with aria-live
- **Color contrast**: Ensure badges and text meet WCAG AA standards
- **Touch targets**: Minimum 44×44px for mobile (entire card is clickable)

### Additional Notes

1. **Server data maintenance**:
   - Server info in `blossom-servers.ts` should be easy to update
   - Consider adding a script to parse `blossom-servers.md` → TypeScript if updating frequently
   - For now, manual sync is acceptable (infrequent updates)

2. **User education**:
   - Step indicator ("Step 2 of 2") helps users understand onboarding length
   - "Optional" label on mirror section reduces pressure
   - Brief descriptions explain purpose without overwhelming

3. **Future enhancements** (out of scope for MVP):
   - Auto-detect user's region and recommend closest CDN
   - Show server latency/speed indicators
   - Allow custom server URL input (currently only preset list)
   - Server health checks with status indicators

## Success Criteria

The implementation is successful when:

1. ✅ New users see a 2-step onboarding flow
2. ✅ Default Blossom servers are pre-selected (1 upload, 2 mirror)
3. ✅ Users can select/deselect servers with checkboxes
4. ✅ "Continue" is disabled when no upload servers selected
5. ✅ Configuration saves correctly to AppContext
6. ✅ Users can later modify servers in Settings
7. ✅ All 4 languages (EN/DE/FR/ES) are supported
8. ✅ Blocked servers (cdn.nostrcheck.me) are excluded
9. ✅ All tests pass (unit + integration)
10. ✅ Accessibility requirements met (keyboard nav, screen readers)

## Open Questions

None - all design questions resolved during brainstorming.

## References

- `blossom-servers.md` - Server comparison data
- `src/components/settings/BlossomServersSection.tsx` - Existing server config UI
- `src/components/FollowImportDialog.tsx` - Current onboarding dialog
- NIP-51 Follow Sets Migration design doc - Reference for onboarding patterns
