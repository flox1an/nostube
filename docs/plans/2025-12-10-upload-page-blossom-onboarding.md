# Upload Page Blossom Onboarding Design

**Date:** 2025-12-10
**Status:** Approved

## Overview

Move Blossom server configuration from the login modal to the upload page as a full-screen prerequisite step. This separates concerns: follow import happens at first login, Blossom configuration happens at first upload attempt.

## Current State

**OnboardingDialog (login modal):**

- Step 1: Follow Import (optional)
- Step 2: Blossom Server Config (combined upload + mirror with checkboxes)

**UploadPage:**

- Always shows VideoUpload form
- Assumes servers are already configured

## Proposed State

**OnboardingDialog (login modal):**

- Only Step 1: Follow Import (no Blossom step)

**UploadPage:**

- First visit: Shows full-screen Blossom onboarding step
- Subsequent visits: Shows normal VideoUpload form
- Tracks completion via `nostube_upload_onboarding_complete` localStorage key

## Key Design Decisions

### 1. Storage Strategy

- **New key:** `nostube_upload_onboarding_complete`
- Tracks whether user has completed upload page onboarding
- Checked on every `/upload` page load
- Independent from login-time follow import

### 2. Server Display Pattern

- **Not chips/tags** - show full ServerCard components with all details
- Display: payment tier, free quota, CDN provider, status, etc.
- Same rich information as in the picker dialog
- Allows informed decisions without reopening picker

### 3. Picker Dialog Pattern

- **Single-select:** Click a server → adds immediately → closes dialog
- **Unified component:** One `BlossomServerPicker` serves both upload and mirror
- **Filtering:** Only shows servers not already added to current list
- **Custom URL support:** Input field at bottom for non-recommended servers

### 4. Upload vs Mirror Separation

- Two separate sections in onboarding step
- Upload Servers: Requires ≥1 server (validation)
- Mirror Servers: Optional, can skip entirely
- Each section has its own "Add Server" button

### 5. Visual Layout

- Centered card layout (max-w-4xl, matching upload form)
- Same container styling as rest of app
- Not true full-screen, maintains app chrome

## Component Architecture

### UploadPage Component

**File:** `src/pages/UploadPage.tsx`

**Logic:**

```typescript
export function UploadPage() {
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem('nostube_upload_onboarding_complete') === 'true'
  )

  const handleOnboardingComplete = () => {
    localStorage.setItem('nostube_upload_onboarding_complete', 'true')
    setOnboardingComplete(true)
  }

  if (!onboardingComplete) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <BlossomOnboardingStep onComplete={handleOnboardingComplete} />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6 pl-4 md:pl-0">Upload Video</h1>
      <VideoUpload />
    </div>
  )
}
```

**Key points:**

- Check localStorage on mount
- Conditional rendering based on completion state
- Same container/max-width styling for consistency
- `handleOnboardingComplete` sets flag and triggers re-render

### BlossomOnboardingStep Component

**File:** `src/components/onboarding/BlossomOnboardingStep.tsx`

**Props:**

```typescript
interface BlossomOnboardingStepProps {
  onComplete: () => void
}
```

**State:**

```typescript
const [uploadServers, setUploadServers] = useState<string[]>([])
const [mirrorServers, setMirrorServers] = useState<string[]>([])
const [showUploadPicker, setShowUploadPicker] = useState(false)
const [showMirrorPicker, setShowMirrorPicker] = useState(false)
```

**Structure:**

```
Card
├── CardHeader
│   ├── Title: "Configure Upload Servers"
│   └── Description: "Before uploading..."
├── CardContent
│   ├── Upload Servers Section
│   │   ├── Title + Description
│   │   ├── Server List (ServerCard components with remove buttons)
│   │   │   OR Empty state message
│   │   └── "Add Upload Server" button
│   ├── Mirror Servers Section (same structure)
│   ├── Validation Error (if no upload servers)
│   └── "Continue" button (disabled if invalid)
└── Picker Dialogs (rendered outside card)
    ├── BlossomServerPicker (upload)
    └── BlossomServerPicker (mirror)
```

**Validation:**

- `isValid = uploadServers.length > 0`
- Continue button disabled when invalid
- Error message shown when invalid

**Configuration Save:**

```typescript
const handleContinue = () => {
  const blossomServers = [
    ...uploadServers.map(url => ({
      url,
      name: deriveServerName(url),
      tags: ['initial upload'] as BlossomServerTag[],
    })),
    ...mirrorServers.map(url => ({
      url,
      name: deriveServerName(url),
      tags: ['mirror'] as BlossomServerTag[],
    })),
  ]

  updateConfig(current => ({ ...current, blossomServers }))
  onComplete()
}
```

### BlossomServerPicker Component

**File:** `src/components/onboarding/BlossomServerPicker.tsx`

**Props:**

```typescript
interface BlossomServerPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludeServers: string[] // Already-added servers to filter out
  onSelect: (url: string) => void
  type: 'upload' | 'mirror' // For i18n context
}
```

**Structure:**

```
Dialog
├── DialogHeader
│   ├── Title: "Select Upload Server" / "Select Mirror Server"
│   └── Description: Context-appropriate text
├── ScrollArea (h-96)
│   └── Server List
│       ├── ServerCard (clickable, filtered)
│       ├── ServerCard (clickable, filtered)
│       └── ... OR Empty state "All servers added"
└── Custom URL Section (border-top)
    ├── Label: "Custom Server URL"
    ├── Input + Add Button
    └── Hint text
```

**Filtering Logic:**

```typescript
const availableServers = RECOMMENDED_BLOSSOM_SERVERS.filter(
  server => !excludeServers.includes(server.url)
)
```

**Interaction:**

- Click ServerCard → calls `onSelect(url)` → parent closes dialog
- Custom URL: Enter key or click "Add" → calls `onSelect(customUrl)`
- Dialog close handled by parent via `onOpenChange`

**i18n keys:**

- `blossomPicker.upload.title` / `blossomPicker.mirror.title`
- `blossomPicker.upload.description` / `blossomPicker.mirror.description`
- Shared: `blossomPicker.noServersAvailable`, `blossomPicker.customUrl.*`

### ServerCard Component Updates

**File:** `src/components/onboarding/ServerCard.tsx`

**New Props:**

```typescript
interface ServerCardProps {
  server: BlossomServerInfo

  // Existing (keep for backward compatibility)
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void

  // New modes
  selectable?: boolean // Shows hover effect, for picker (click handled by parent)
  onRemove?: () => void // Shows remove button, for onboarding step list
}
```

**Behavior:**

1. If `onCheckedChange` exists → Checkbox mode (old behavior)
2. If `onRemove` exists → Removable mode (show X button)
3. If `selectable` → Clickable mode (hover effect, no controls)
4. Else → Display-only mode (fallback)

**Styling notes:**

- Selectable: Add `hover:bg-accent` class (applied by parent wrapper)
- Removable: Add X button in top-right or right side
- Keep existing layout for server details (payment, quota, CDN, etc.)

### OnboardingDialog Updates

**File:** `src/components/OnboardingDialog.tsx`

**Changes:**

1. Remove `BlossomServerConfigStep` import
2. Remove `BLOSSOM_CONFIG_STORAGE_KEY` constant
3. Simplify `OnboardingDialogContent` to only render `FollowImportStep`
4. Remove step 2 logic from `OnboardingDialog` component
5. Simplify `dialogState` logic to only check follow import conditions

**New structure:**

```typescript
function OnboardingDialogContent({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('onboarding.followImport.title')}</DialogTitle>
        <DialogDescription>{t('onboarding.followImport.description')}</DialogDescription>
      </DialogHeader>

      <div className="py-4">
        <FollowImportStep
          onComplete={onComplete}
          onSkip={onComplete}
        />
      </div>
    </>
  )
}

export function OnboardingDialog() {
  const { user } = useCurrentUser()
  const { hasFollowSet, hasKind3Contacts } = useFollowSet()
  const [isCompleted, setIsCompleted] = useState(false)

  const shouldShow = useMemo(() => {
    if (!user?.pubkey || isCompleted) return false

    const followImportCompleted = localStorage.getItem(FOLLOW_IMPORT_STORAGE_KEY)

    // Only show if user has kind 3 contacts but no follow set and hasn't completed import
    return !followImportCompleted && !hasFollowSet && hasKind3Contacts
  }, [user?.pubkey, hasFollowSet, hasKind3Contacts, isCompleted])

  const handleComplete = () => {
    setIsCompleted(true)
  }

  return (
    <Dialog open={shouldShow} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-2xl" hideCloseButton>
        <OnboardingDialogContent onComplete={handleComplete} />
      </DialogContent>
    </Dialog>
  )
}
```

**Result:** OnboardingDialog only handles follow import, no Blossom step.

## Translation Keys

### English (en.json)

```json
{
  "uploadOnboarding": {
    "title": "Configure Upload Servers",
    "description": "Before uploading videos, you need to configure at least one upload server. You can also add optional mirror servers for redundancy.",

    "uploadServers": {
      "title": "Upload Servers",
      "description": "Choose where your videos will be uploaded. At least one server is required.",
      "empty": "No upload servers configured yet. Click 'Add Upload Server' to get started.",
      "addServer": "Add Upload Server",
      "required": "At least one upload server is required"
    },

    "mirrorServers": {
      "title": "Mirror Servers (Optional)",
      "description": "Mirror servers create backup copies of your videos for better availability.",
      "empty": "No mirror servers configured. This is optional.",
      "addServer": "Add Mirror Server"
    },

    "continue": "Continue to Upload"
  },

  "blossomPicker": {
    "upload": {
      "title": "Select Upload Server",
      "description": "Choose a server from the recommended list or add a custom URL."
    },
    "mirror": {
      "title": "Select Mirror Server",
      "description": "Choose a server to create backup copies of your videos."
    },
    "noServersAvailable": "All available servers have been added.",
    "customUrl": {
      "label": "Custom Server URL",
      "placeholder": "https://your-blossom-server.com",
      "add": "Add",
      "hint": "Enter the full URL of a Blossom-compatible server"
    }
  }
}
```

### German (de.json)

```json
{
  "uploadOnboarding": {
    "title": "Upload-Server konfigurieren",
    "description": "Bevor Sie Videos hochladen können, müssen Sie mindestens einen Upload-Server konfigurieren. Sie können auch optionale Mirror-Server für Redundanz hinzufügen.",

    "uploadServers": {
      "title": "Upload-Server",
      "description": "Wählen Sie, wohin Ihre Videos hochgeladen werden. Mindestens ein Server ist erforderlich.",
      "empty": "Noch keine Upload-Server konfiguriert. Klicken Sie auf 'Upload-Server hinzufügen', um zu beginnen.",
      "addServer": "Upload-Server hinzufügen",
      "required": "Mindestens ein Upload-Server ist erforderlich"
    },

    "mirrorServers": {
      "title": "Mirror-Server (Optional)",
      "description": "Mirror-Server erstellen Sicherungskopien Ihrer Videos für bessere Verfügbarkeit.",
      "empty": "Keine Mirror-Server konfiguriert. Dies ist optional.",
      "addServer": "Mirror-Server hinzufügen"
    },

    "continue": "Weiter zum Upload"
  },

  "blossomPicker": {
    "upload": {
      "title": "Upload-Server auswählen",
      "description": "Wählen Sie einen Server aus der empfohlenen Liste oder fügen Sie eine benutzerdefinierte URL hinzu."
    },
    "mirror": {
      "title": "Mirror-Server auswählen",
      "description": "Wählen Sie einen Server, um Sicherungskopien Ihrer Videos zu erstellen."
    },
    "noServersAvailable": "Alle verfügbaren Server wurden hinzugefügt.",
    "customUrl": {
      "label": "Benutzerdefinierte Server-URL",
      "placeholder": "https://ihr-blossom-server.de",
      "add": "Hinzufügen",
      "hint": "Geben Sie die vollständige URL eines Blossom-kompatiblen Servers ein"
    }
  }
}
```

### French (fr.json)

```json
{
  "uploadOnboarding": {
    "title": "Configurer les serveurs de téléchargement",
    "description": "Avant de télécharger des vidéos, vous devez configurer au moins un serveur de téléchargement. Vous pouvez également ajouter des serveurs miroirs optionnels pour la redondance.",

    "uploadServers": {
      "title": "Serveurs de téléchargement",
      "description": "Choisissez où vos vidéos seront téléchargées. Au moins un serveur est requis.",
      "empty": "Aucun serveur de téléchargement configuré. Cliquez sur 'Ajouter un serveur de téléchargement' pour commencer.",
      "addServer": "Ajouter un serveur de téléchargement",
      "required": "Au moins un serveur de téléchargement est requis"
    },

    "mirrorServers": {
      "title": "Serveurs miroirs (Optionnel)",
      "description": "Les serveurs miroirs créent des copies de sauvegarde de vos vidéos pour une meilleure disponibilité.",
      "empty": "Aucun serveur miroir configuré. Ceci est optionnel.",
      "addServer": "Ajouter un serveur miroir"
    },

    "continue": "Continuer vers le téléchargement"
  },

  "blossomPicker": {
    "upload": {
      "title": "Sélectionner un serveur de téléchargement",
      "description": "Choisissez un serveur dans la liste recommandée ou ajoutez une URL personnalisée."
    },
    "mirror": {
      "title": "Sélectionner un serveur miroir",
      "description": "Choisissez un serveur pour créer des copies de sauvegarde de vos vidéos."
    },
    "noServersAvailable": "Tous les serveurs disponibles ont été ajoutés.",
    "customUrl": {
      "label": "URL de serveur personnalisée",
      "placeholder": "https://votre-serveur-blossom.com",
      "add": "Ajouter",
      "hint": "Entrez l'URL complète d'un serveur compatible Blossom"
    }
  }
}
```

### Spanish (es.json)

```json
{
  "uploadOnboarding": {
    "title": "Configurar servidores de carga",
    "description": "Antes de subir videos, necesita configurar al menos un servidor de carga. También puede agregar servidores espejo opcionales para redundancia.",

    "uploadServers": {
      "title": "Servidores de carga",
      "description": "Elija dónde se subirán sus videos. Se requiere al menos un servidor.",
      "empty": "No hay servidores de carga configurados aún. Haga clic en 'Agregar servidor de carga' para comenzar.",
      "addServer": "Agregar servidor de carga",
      "required": "Se requiere al menos un servidor de carga"
    },

    "mirrorServers": {
      "title": "Servidores espejo (Opcional)",
      "description": "Los servidores espejo crean copias de respaldo de sus videos para mejor disponibilidad.",
      "empty": "No hay servidores espejo configurados. Esto es opcional.",
      "addServer": "Agregar servidor espejo"
    },

    "continue": "Continuar a la carga"
  },

  "blossomPicker": {
    "upload": {
      "title": "Seleccionar servidor de carga",
      "description": "Elija un servidor de la lista recomendada o agregue una URL personalizada."
    },
    "mirror": {
      "title": "Seleccionar servidor espejo",
      "description": "Elija un servidor para crear copias de respaldo de sus videos."
    },
    "noServersAvailable": "Todos los servidores disponibles han sido agregados.",
    "customUrl": {
      "label": "URL de servidor personalizada",
      "placeholder": "https://su-servidor-blossom.com",
      "add": "Agregar",
      "hint": "Ingrese la URL completa de un servidor compatible con Blossom"
    }
  }
}
```

## File Changes Summary

### Files to Create

- `src/components/onboarding/BlossomOnboardingStep.tsx` - Full-screen onboarding step
- `src/components/onboarding/BlossomServerPicker.tsx` - Unified picker dialog

### Files to Modify

- `src/pages/UploadPage.tsx` - Add conditional rendering for onboarding
- `src/components/onboarding/ServerCard.tsx` - Add `selectable` and `onRemove` props
- `src/components/OnboardingDialog.tsx` - Remove Blossom step, keep only Follow Import
- `src/locales/en.json` - Add `uploadOnboarding` and `blossomPicker` keys
- `src/locales/de.json` - Add German translations
- `src/locales/fr.json` - Add French translations
- `src/locales/es.json` - Add Spanish translations

### Files to Delete

- `src/components/onboarding/BlossomServerConfigStep.tsx` - No longer needed

### localStorage Keys

- **Keep:** `nostube_onboarding_follow_import` (login modal)
- **Remove usage:** `nostube_onboarding_blossom_config` (no longer checked)
- **Add:** `nostube_upload_onboarding_complete` (upload page)

## Testing Strategy

### Manual Testing Checklist

**First-time upload flow:**

1. Clear `nostube_upload_onboarding_complete` from localStorage
2. Visit `/upload` → should see onboarding step (not upload form)
3. Verify "Continue" button is disabled
4. Verify validation error appears: "At least one upload server is required"
5. Click "Add Upload Server" → picker dialog opens
6. Verify picker shows recommended servers with full details
7. Click a server → dialog closes, server appears in upload list
8. Verify server shows full details (payment, quota, CDN, etc.)
9. Verify remove button (X) appears on server card
10. Click remove → server disappears from list
11. Re-add upload server
12. Click "Add Mirror Server" → picker dialog opens
13. Verify picker filters out upload server already added
14. Click a mirror server → appears in mirror section
15. Add custom URL via input field → appears in mirror section
16. Click "Continue" → onboarding completes
17. Verify localStorage `nostube_upload_onboarding_complete` is set to 'true'
18. Verify upload form appears

**Return visit:**

1. Refresh `/upload` page
2. Verify goes directly to upload form (no onboarding)
3. Verify Settings > Blossom Servers shows correct tags:
   - Upload servers have tag "initial upload"
   - Mirror servers have tag "mirror"

**Login modal:**

1. Clear `nostube_onboarding_follow_import` from localStorage
2. Ensure user has kind 3 contacts but no follow set
3. Login → verify dialog shows only Follow Import step
4. Verify no Blossom configuration step appears
5. Complete follow import → dialog closes

**Edge cases:**

1. Try to add same server twice → picker should filter it out
2. Add all recommended servers → picker should show "All servers added"
3. Remove all upload servers → validation error reappears
4. Custom URL with trailing slash → should normalize correctly

### Language Testing

1. Change language to German → verify all text appears in German
2. Repeat for French and Spanish
3. Verify picker dialog text changes based on `type` prop

## Migration Strategy

No data migration needed. Existing users:

- Already have `nostube_onboarding_blossom_config` set (ignored)
- May or may not have servers configured
- Will see upload onboarding on first `/upload` visit if no servers configured
- Will skip directly to upload form if servers already configured

New users:

- See follow import on first login
- See Blossom onboarding on first upload attempt
- Clean separation of concerns

## Success Criteria

- [ ] Follow import only appears in login modal
- [ ] Blossom onboarding only appears on first upload page visit
- [ ] Upload servers require ≥1 selection (validation)
- [ ] Mirror servers are optional (can be 0)
- [ ] Picker dialog filters already-added servers
- [ ] Picker dialog supports custom URLs
- [ ] ServerCard shows full details in both onboarding and picker
- [ ] Remove button works correctly
- [ ] Configuration saves with correct tags
- [ ] localStorage `nostube_upload_onboarding_complete` set on completion
- [ ] All four languages (EN/DE/FR/ES) have complete translations
- [ ] No console errors or warnings
- [ ] TypeScript compiles without errors
- [ ] Build succeeds

## Architecture Notes

**Why separate onboarding?**

- Login modal: Critical path for authentication and social graph setup
- Upload page: Feature-specific configuration, only needed when uploading
- Better separation of concerns, less overwhelming for new users

**Why single-select picker?**

- Simpler interaction model (click = add)
- Clearer user intent per action
- Easier to implement and maintain
- Can still add multiple servers (just open picker multiple times)

**Why show full ServerCard details?**

- Informed decision-making without reopening picker
- Consistency between picker and onboarding list
- Visual confirmation of what was selected
- No surprises about server capabilities

**Why unified picker component?**

- DRY principle - one implementation for both use cases
- Easier to maintain and update
- Consistent UX between upload and mirror selection
- Type-based i18n keeps context clear
