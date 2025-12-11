# Upload Page Blossom Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Blossom server configuration from login modal to upload page as a full-screen prerequisite step, showing server details and using a unified picker dialog.

**Architecture:** Conditional rendering in UploadPage based on localStorage flag. New BlossomOnboardingStep component with separate upload/mirror sections showing full ServerCard details. Unified BlossomServerPicker dialog with single-select pattern and custom URL support. Update ServerCard to support new display modes.

**Tech Stack:** React 18, TypeScript, react-i18next, shadcn/ui (Dialog, Button, Card, ScrollArea, Input, Label), existing ServerCard component

---

## Task 1: Update ServerCard Component for New Modes

**Files:**

- Modify: `src/components/onboarding/ServerCard.tsx`

**Step 1: Read the current ServerCard implementation**

Run: `cat src/components/onboarding/ServerCard.tsx | head -50`
Expected: See current props interface and implementation

**Step 2: Add new props to interface**

Add to the `ServerCardProps` interface:

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

**Step 3: Add remove button UI**

After the existing JSX but before the closing div, add conditional remove button:

```typescript
{onRemove && (
  <Button
    variant="ghost"
    size="sm"
    onClick={(e) => {
      e.stopPropagation()
      onRemove()
    }}
    className="absolute top-2 right-2"
  >
    <X className="h-4 w-4" />
  </Button>
)}
```

Import X icon at the top: `import { X } from 'lucide-react'`

**Step 4: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 5: Commit ServerCard updates**

```bash
git add src/components/onboarding/ServerCard.tsx
git commit -m "feat: add selectable and onRemove props to ServerCard"
```

---

## Task 2: Create BlossomServerPicker Dialog

**Files:**

- Create: `src/components/onboarding/BlossomServerPicker.tsx`

**Step 1: Create the file with imports and interface**

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServerCard } from './ServerCard'
import { RECOMMENDED_BLOSSOM_SERVERS } from '@/lib/blossom-servers'

interface BlossomServerPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludeServers: string[]  // Already-added servers to filter out
  onSelect: (url: string) => void
  type: 'upload' | 'mirror'  // For i18n context
}

export function BlossomServerPicker({
  open,
  onOpenChange,
  excludeServers,
  onSelect,
  type,
}: BlossomServerPickerProps) {
  const { t } = useTranslation()
  const [customUrl, setCustomUrl] = useState('')

  // Filter out already-added servers
  const availableServers = RECOMMENDED_BLOSSOM_SERVERS.filter(
    server => !excludeServers.includes(server.url)
  )

  const handleCustomAdd = () => {
    if (customUrl.trim()) {
      onSelect(customUrl.trim())
      setCustomUrl('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(`blossomPicker.${type}.title`)}
          </DialogTitle>
          <DialogDescription>
            {t(`blossomPicker.${type}.description`)}
          </DialogDescription>
        </DialogHeader>

        {/* Recommended Servers List */}
        <ScrollArea className="h-96 rounded-md border p-3">
          <div className="space-y-2">
            {availableServers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {t('blossomPicker.noServersAvailable')}
              </div>
            ) : (
              availableServers.map(server => (
                <div
                  key={server.url}
                  onClick={() => onSelect(server.url)}
                  className="cursor-pointer hover:bg-accent rounded transition-colors"
                >
                  <ServerCard server={server} selectable />
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Custom URL Input */}
        <div className="space-y-2 pt-4 border-t">
          <Label>{t('blossomPicker.customUrl.label')}</Label>
          <div className="flex gap-2">
            <Input
              placeholder={t('blossomPicker.customUrl.placeholder')}
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomAdd()}
            />
            <Button onClick={handleCustomAdd} disabled={!customUrl.trim()}>
              {t('blossomPicker.customUrl.add')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('blossomPicker.customUrl.hint')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 3: Commit BlossomServerPicker**

```bash
git add src/components/onboarding/BlossomServerPicker.tsx
git commit -m "feat: add BlossomServerPicker dialog component"
```

---

## Task 3: Create BlossomOnboardingStep Component

**Files:**

- Create: `src/components/onboarding/BlossomOnboardingStep.tsx`

**Step 1: Create the file with imports and interface**

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServerCard } from './ServerCard'
import { BlossomServerPicker } from './BlossomServerPicker'
import { RECOMMENDED_BLOSSOM_SERVERS, deriveServerName } from '@/lib/blossom-servers'
import type { BlossomServerTag } from '@/contexts/AppContext'

interface BlossomOnboardingStepProps {
  onComplete: () => void
}

export function BlossomOnboardingStep({ onComplete }: BlossomOnboardingStepProps) {
  const { t } = useTranslation()
  const { updateConfig } = useAppContext()

  const [uploadServers, setUploadServers] = useState<string[]>([])
  const [mirrorServers, setMirrorServers] = useState<string[]>([])
  const [showUploadPicker, setShowUploadPicker] = useState(false)
  const [showMirrorPicker, setShowMirrorPicker] = useState(false)

  const handleContinue = () => {
    // Save to config
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

  const isValid = uploadServers.length > 0

  // Helper to get server info for display
  const getServerInfo = (url: string) => {
    return RECOMMENDED_BLOSSOM_SERVERS.find(s => s.url === url) || { url }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('uploadOnboarding.title')}</CardTitle>
          <CardDescription>{t('uploadOnboarding.description')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Upload Servers Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">
                {t('uploadOnboarding.uploadServers.title')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('uploadOnboarding.uploadServers.description')}
              </p>
            </div>

            {uploadServers.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded p-4">
                {t('uploadOnboarding.uploadServers.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {uploadServers.map(url => (
                  <ServerCard
                    key={url}
                    server={getServerInfo(url)}
                    onRemove={() => setUploadServers(prev => prev.filter(s => s !== url))}
                  />
                ))}
              </div>
            )}

            <Button onClick={() => setShowUploadPicker(true)}>
              {t('uploadOnboarding.uploadServers.addServer')}
            </Button>
          </div>

          {/* Mirror Servers Section */}
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">
                {t('uploadOnboarding.mirrorServers.title')}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t('uploadOnboarding.mirrorServers.description')}
              </p>
            </div>

            {mirrorServers.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded p-4">
                {t('uploadOnboarding.mirrorServers.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {mirrorServers.map(url => (
                  <ServerCard
                    key={url}
                    server={getServerInfo(url)}
                    onRemove={() => setMirrorServers(prev => prev.filter(s => s !== url))}
                  />
                ))}
              </div>
            )}

            <Button onClick={() => setShowMirrorPicker(true)}>
              {t('uploadOnboarding.mirrorServers.addServer')}
            </Button>
          </div>

          {/* Validation Error */}
          {!isValid && (
            <p className="text-sm text-destructive">
              {t('uploadOnboarding.uploadServers.required')}
            </p>
          )}

          {/* Continue Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleContinue} disabled={!isValid} className="min-w-32">
              {t('uploadOnboarding.continue')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Picker Dialogs */}
      <BlossomServerPicker
        open={showUploadPicker}
        onOpenChange={setShowUploadPicker}
        excludeServers={uploadServers}
        onSelect={(url) => {
          setUploadServers(prev => [...prev, url])
          setShowUploadPicker(false)
        }}
        type="upload"
      />

      <BlossomServerPicker
        open={showMirrorPicker}
        onOpenChange={setShowMirrorPicker}
        excludeServers={mirrorServers}
        onSelect={(url) => {
          setMirrorServers(prev => [...prev, url])
          setShowMirrorPicker(false)
        }}
        type="mirror"
      />
    </>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 3: Commit BlossomOnboardingStep**

```bash
git add src/components/onboarding/BlossomOnboardingStep.tsx
git commit -m "feat: add BlossomOnboardingStep component"
```

---

## Task 4: Update UploadPage for Conditional Rendering

**Files:**

- Modify: `src/pages/UploadPage.tsx`

**Step 1: Read current UploadPage**

Run: `cat src/pages/UploadPage.tsx`
Expected: See simple component that always renders VideoUpload

**Step 2: Add imports**

Add these imports at the top:

```typescript
import { useState } from 'react'
import { BlossomOnboardingStep } from '@/components/onboarding/BlossomOnboardingStep'
```

**Step 3: Replace the component with conditional logic**

Replace the entire `UploadPage` function with:

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
        <h1 className="text-3xl font-bold mb-6 pl-4 md:pl-0">Upload Video</h1>
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

**Step 4: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 5: Commit UploadPage updates**

```bash
git add src/pages/UploadPage.tsx
git commit -m "feat: add conditional rendering for Blossom onboarding in UploadPage"
```

---

## Task 5: Update OnboardingDialog to Remove Blossom Step

**Files:**

- Modify: `src/components/OnboardingDialog.tsx`

**Step 1: Read current OnboardingDialog**

Run: `cat src/components/OnboardingDialog.tsx`
Expected: See 2-step dialog with Follow Import and Blossom Config

**Step 2: Remove Blossom imports and constants**

Remove these lines:

```typescript
import { BlossomServerConfigStep } from './onboarding/BlossomServerConfigStep'
const BLOSSOM_CONFIG_STORAGE_KEY = 'nostube_onboarding_blossom_config'
```

**Step 3: Simplify OnboardingDialogContent**

Replace the entire `OnboardingDialogContent` function (lines ~18-76) with:

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
        <FollowImportStep onComplete={onComplete} onSkip={onComplete} />
      </div>
    </>
  )
}
```

**Step 4: Simplify OnboardingDialog logic**

Replace the `dialogState` useMemo (lines ~84-107) with:

```typescript
const shouldShow = useMemo(() => {
  if (!user?.pubkey || isCompleted) return false

  const followImportCompleted = localStorage.getItem(FOLLOW_IMPORT_STORAGE_KEY)

  // Only show if user has kind 3 contacts but no follow set and hasn't completed import
  return !followImportCompleted && !hasFollowSet && hasKind3Contacts
}, [user?.pubkey, hasFollowSet, hasKind3Contacts, isCompleted])
```

**Step 5: Update Dialog open prop**

Change line ~114 from:

```typescript
<Dialog open={dialogState.shouldShow} onOpenChange={() => {}}>
```

To:

```typescript
<Dialog open={shouldShow} onOpenChange={() => {}}>
```

**Step 6: Remove key prop from OnboardingDialogContent**

Change line ~116-119 from:

```typescript
<OnboardingDialogContent
  key={dialogState.initialStep}
  initialStep={dialogState.initialStep}
  onComplete={handleComplete}
/>
```

To:

```typescript
<OnboardingDialogContent onComplete={handleComplete} />
```

**Step 7: Verify TypeScript compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 8: Commit OnboardingDialog updates**

```bash
git add src/components/OnboardingDialog.tsx
git commit -m "refactor: remove Blossom step from OnboardingDialog, keep only Follow Import"
```

---

## Task 6: Delete BlossomServerConfigStep

**Files:**

- Delete: `src/components/onboarding/BlossomServerConfigStep.tsx`

**Step 1: Remove the file**

Run: `rm src/components/onboarding/BlossomServerConfigStep.tsx`

**Step 2: Verify build still works**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors (file no longer referenced)

**Step 3: Commit deletion**

```bash
git add -A
git commit -m "chore: delete unused BlossomServerConfigStep component"
```

---

## Task 7: Add English Translation Keys

**Files:**

- Modify: `src/locales/en.json`

**Step 1: Read current translations structure**

Run: `cat src/locales/en.json | grep -A 5 '"onboarding"'`
Expected: See existing onboarding section

**Step 2: Add uploadOnboarding section**

Add this section after the existing `"onboarding"` section (around line ~150):

```json
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
},
```

**Step 3: Verify JSON is valid**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors (JSON parsed correctly)

**Step 4: Commit English translations**

```bash
git add src/locales/en.json
git commit -m "feat: add English translations for upload onboarding"
```

---

## Task 8: Add German Translation Keys

**Files:**

- Modify: `src/locales/de.json`

**Step 1: Add uploadOnboarding section in same location as English**

```json
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
},
```

**Step 2: Verify JSON is valid**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 3: Commit German translations**

```bash
git add src/locales/de.json
git commit -m "feat: add German translations for upload onboarding"
```

---

## Task 9: Add French Translation Keys

**Files:**

- Modify: `src/locales/fr.json`

**Step 1: Add uploadOnboarding section**

```json
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
},
```

**Step 2: Verify JSON is valid**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 3: Commit French translations**

```bash
git add src/locales/fr.json
git commit -m "feat: add French translations for upload onboarding"
```

---

## Task 10: Add Spanish Translation Keys

**Files:**

- Modify: `src/locales/es.json`

**Step 1: Add uploadOnboarding section**

```json
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
},
```

**Step 2: Verify JSON is valid**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: No errors

**Step 3: Commit Spanish translations**

```bash
git add src/locales/es.json
git commit -m "feat: add Spanish translations for upload onboarding"
```

---

## Task 11: Run Full Build and Test

**Files:**

- None (verification only)

**Step 1: Run TypeScript type check**

Run: `npm run typecheck`
Expected: No errors

**Step 2: Run ESLint**

Run: `npx eslint src --ext .ts,.tsx`
Expected: No errors

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass (347 passing, 1 skipped)

**Step 4: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 5: Verify all changes**

Run: `git status`
Expected: Clean working tree (all changes committed)

---

## Task 12: Manual Testing and Verification

**Files:**

- None (manual testing)

**Step 1: Clear onboarding state**

Run in browser console:

```javascript
localStorage.removeItem('nostube_upload_onboarding_complete')
```

**Step 2: Start dev server**

Run: `npm run dev`

**Step 3: Test first-time upload flow**

Manual steps:

1. Navigate to `/upload`
2. Verify Blossom onboarding step appears (not upload form)
3. Verify "Continue" button is disabled
4. Verify validation error: "At least one upload server is required"
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
15. Try adding custom URL via input field
16. Click "Continue" → upload form appears
17. Refresh page → verify goes directly to upload form

**Step 4: Test login modal**

Manual steps:

1. Clear `nostube_onboarding_follow_import` from localStorage
2. Reload page while logged in
3. Verify dialog shows only Follow Import step (no Blossom)
4. Complete follow import → dialog closes

**Step 5: Test all languages**

Manual steps:

1. Change language to German in Settings
2. Clear `nostube_upload_onboarding_complete`
3. Visit `/upload` → verify all text in German
4. Repeat for French and Spanish

**Step 6: Document test results**

Expected: All manual tests pass, no console errors

---

## Task 13: Update CHANGELOG

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Add entry under ## [Unreleased] → ### Changed**

```markdown
### Changed

- **Onboarding Separation**: Moved Blossom server configuration from login modal to upload page as full-screen prerequisite step. Login modal now only shows Follow Import. Upload page checks `nostube_upload_onboarding_complete` localStorage key and displays server configuration before first upload. Components: `BlossomOnboardingStep` (full-screen card with upload/mirror sections), `BlossomServerPicker` (unified dialog with single-select and custom URL support). ServerCard updated with `selectable` and `onRemove` props. Validation requires ≥1 upload server, mirrors optional. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-10-upload-page-blossom-onboarding.md`
```

**Step 2: Commit CHANGELOG**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for upload page Blossom onboarding"
```

---

## Task 14: Run Formatter and Final Verification

**Files:**

- All modified files

**Step 1: Run Prettier**

Run: `npm run format`
Expected: Files formatted successfully

**Step 2: Check for formatting changes**

Run: `git status`
Expected: If changes, commit them; if clean, proceed

**Step 3: Commit formatting changes (if any)**

```bash
git add -A
git commit -m "chore: run prettier formatting"
```

**Step 4: Verify clean working tree**

Run: `git status`
Expected: "nothing to commit, working tree clean"

**Step 5: Review all commits**

Run: `git log --oneline -15`
Expected: See all commits from this implementation

---

## Success Criteria Checklist

- [ ] ServerCard component updated with `selectable` and `onRemove` props
- [ ] BlossomServerPicker dialog created with unified upload/mirror support
- [ ] BlossomOnboardingStep component created with full-screen layout
- [ ] UploadPage updated with conditional rendering based on localStorage
- [ ] OnboardingDialog simplified to only show Follow Import
- [ ] BlossomServerConfigStep deleted
- [ ] All 4 language files (EN/DE/FR/ES) have new translation keys
- [ ] TypeScript compiles without errors
- [ ] ESLint passes with no errors
- [ ] All tests passing (347 passing, 1 skipped)
- [ ] Production build succeeds
- [ ] Manual testing completed in all languages
- [ ] Upload servers require ≥1 selection (validation works)
- [ ] Mirror servers are optional (can continue with 0)
- [ ] Picker dialog filters already-added servers
- [ ] Custom URL support works
- [ ] ServerCard shows full details in both onboarding and picker
- [ ] Remove button works correctly
- [ ] Configuration saves with correct tags
- [ ] localStorage `nostube_upload_onboarding_complete` set on completion
- [ ] CHANGELOG updated
- [ ] Code formatted with Prettier
- [ ] All changes committed with clean working tree

---

## Notes for Engineer

**Key Principles:**

- **DRY:** Reuse ServerCard component, unified BlossomServerPicker for both upload/mirror
- **YAGNI:** No back navigation, no pre-selection, minimal state management
- **Clear separation:** Upload vs Mirror concerns fully separated, login modal vs upload page separated
- **User choice:** No defaults, users make conscious decisions

**Common Pitfalls:**

- Don't forget to import X icon from lucide-react for remove button
- ServerCard `onRemove` must stop propagation to avoid parent click handlers
- Picker dialog `onSelect` closes dialog in parent component, not in picker itself
- localStorage key is `nostube_upload_onboarding_complete` (with underscore)
- Remember to filter already-added servers in picker: `excludeServers` prop

**Testing Notes:**

- No unit tests required for these components (following project pattern)
- Manual testing is critical - verify full flow in all languages
- Pay special attention to validation behavior and localStorage flags
- Test custom URL input with various formats (with/without trailing slash)

**Architecture Notes:**

- State flows one way: User adds servers → saves to config → onComplete callback
- Only final "Continue" button saves to localStorage and triggers completion
- Dialog visibility logic in UploadPage is simple: check localStorage flag
- OnboardingDialog and UploadPage are now completely independent
