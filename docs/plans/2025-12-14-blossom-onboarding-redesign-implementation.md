# Blossom Onboarding Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the upload page Blossom onboarding UI to be more beginner-friendly with a cleaner, icon-based interface and progressive disclosure.

**Architecture:** Two-column layout for upload/mirror servers with icon-only + buttons, dashed border empty states, hover-based remove buttons, and a streamlined modal with progressive disclosure (minimal info by default, details on hover).

**Tech Stack:** React 18, TypeScript, TailwindCSS, shadcn/ui, lucide-react icons, react-i18next

---

## Task 1: Update ServerCard with Progressive Disclosure Mode

**Files:**
- Modify: `src/components/onboarding/ServerCard.tsx:1-107`

**Step 1: Add showDetailsOnHover prop to ServerCard**

Update the `ServerCardProps` interface to include the new prop:

```typescript
interface ServerCardProps {
  server: BlossomServerInfo

  // Existing (keep for backward compatibility)
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void

  // New modes
  selectable?: boolean // Shows hover effect, for picker (click handled by parent)
  showDetailsOnHover?: boolean // NEW: Progressive disclosure in modal
  onRemove?: () => void // Shows remove button, for onboarding step list
}
```

**Step 2: Update component signature**

Add the new prop to destructuring:

```typescript
export function ServerCard({
  server,
  checked,
  onCheckedChange,
  selectable,
  showDetailsOnHover, // NEW
  onRemove,
}: ServerCardProps) {
```

**Step 3: Implement conditional rendering for progressive disclosure**

Replace the current content rendering (lines 49-90) with conditional logic:

```typescript
<div className="flex-1 space-y-1.5">
  {showDetailsOnHover ? (
    <>
      {/* Minimal info always visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={server.url} className="font-medium text-sm cursor-pointer">
          {server.name}
        </label>
        <Badge
          variant={server.payment === 'free' ? 'secondary' : 'default'}
          className={cn(
            'text-xs',
            server.payment === 'paid' && 'bg-orange-500 hover:bg-orange-500/90'
          )}
        >
          {t(`onboarding.blossom.serverInfo.${server.payment}`)}
        </Badge>
      </div>

      {/* Details revealed on hover using group-hover */}
      <div className="hidden group-hover:block transition-all text-xs text-muted-foreground space-y-0.5">
        {server.supportsMirror && (
          <div className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-green-500" />
            <span>
              {t('onboarding.blossom.serverInfo.supportsMirror')}
              {server.cdnProvider && ` • ${server.cdnProvider}`}
            </span>
          </div>
        )}
        {!server.supportsMirror && server.cdnProvider && (
          <div className="flex items-center gap-1.5">
            <span>{server.cdnProvider}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <HardDrive className="h-3 w-3" />
          <span>
            {server.maxFileSize || t('onboarding.blossom.serverInfo.noLimit')}
            {' • '}
            {server.retention || t('onboarding.blossom.serverInfo.unlimited')}
            {server.price && ` • ${server.price}`}
          </span>
        </div>
      </div>
    </>
  ) : (
    // Full details always visible (current behavior)
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={server.url} className="font-medium text-sm cursor-pointer">
          {server.name}
        </label>
        <Badge
          variant={server.payment === 'free' ? 'secondary' : 'default'}
          className={cn(
            'text-xs',
            server.payment === 'paid' && 'bg-orange-500 hover:bg-orange-500/90'
          )}
        >
          {t(`onboarding.blossom.serverInfo.${server.payment}`)}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        {server.supportsMirror && (
          <div className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-green-500" />
            <span>
              {t('onboarding.blossom.serverInfo.supportsMirror')}
              {server.cdnProvider && ` • ${server.cdnProvider}`}
            </span>
          </div>
        )}
        {!server.supportsMirror && server.cdnProvider && (
          <div className="flex items-center gap-1.5">
            <span>{server.cdnProvider}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span>📦</span>
          <span>
            {server.maxFileSize || t('onboarding.blossom.serverInfo.noLimit')}
            {' • '}
            {server.retention || t('onboarding.blossom.serverInfo.unlimited')}
            {server.price && ` • ${server.price}`}
          </span>
        </div>
      </div>
    </>
  )}
</div>
```

**Step 4: Add missing HardDrive import**

Add to imports at top of file:

```typescript
import { Check, X, HardDrive } from 'lucide-react'
```

**Step 5: Update remove button to use opacity-based hover**

Replace the remove button section (lines 91-103) with opacity transition:

```typescript
{onRemove && (
  <Button
    variant="ghost"
    size="icon"
    onClick={e => {
      e.stopPropagation()
      onRemove()
    }}
    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
  >
    <X className="h-4 w-4" />
  </Button>
)}
```

**Step 6: Add group class to container div**

Update the container div (line 31) to include `group`:

```typescript
<div
  className={cn(
    'group flex items-start gap-3 p-3 rounded-lg border bg-card transition-colors relative',
    onCheckedChange && 'cursor-pointer hover:bg-accent/50',
    checked && 'border-purple-500 bg-purple-500/5',
    selectable && 'hover:bg-accent'
  )}
  onClick={() => onCheckedChange && onCheckedChange(!checked)}
>
```

**Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors

**Step 8: Commit**

```bash
git add src/components/onboarding/ServerCard.tsx
git commit -m "feat: add progressive disclosure mode to ServerCard

- Add showDetailsOnHover prop for modal use case
- Minimal info shown by default (name + payment badge)
- Details revealed on hover using group-hover
- Update remove button to use opacity transition
- Add HardDrive icon for storage info
- Maintain backward compatibility"
```

---

## Task 2: Update BlossomServerPicker Modal Styling

**Files:**
- Modify: `src/components/onboarding/BlossomServerPicker.tsx:1-96`

**Step 1: Update DialogContent max-width**

Change line 49 from `sm:max-w-2xl` to just `max-w-2xl`:

```typescript
<DialogContent className="max-w-2xl">
```

**Step 2: Update ServerCard usage to enable progressive disclosure**

Update line 69 to include `showDetailsOnHover`:

```typescript
<ServerCard server={server} selectable showDetailsOnHover />
```

**Step 3: Add collapsible custom URL section**

Replace the custom URL section (lines 76-91) with collapsible version:

```typescript
{/* Custom URL Input */}
<div className="space-y-2 pt-4 border-t">
  <Button
    variant="ghost"
    size="sm"
    onClick={() => setShowCustomInput(!showCustomInput)}
    className="gap-2"
  >
    <Link className="h-4 w-4" />
    {t('blossomPicker.customUrl.label')}
  </Button>

  {showCustomInput && (
    <>
      <div className="flex gap-2">
        <Input
          placeholder={t('blossomPicker.customUrl.placeholder')}
          value={customUrl}
          onChange={e => setCustomUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
        />
        <Button onClick={handleCustomAdd} disabled={!customUrl.trim()}>
          {t('blossomPicker.customUrl.add')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('blossomPicker.customUrl.hint')}</p>
    </>
  )}
</div>
```

**Step 4: Add state for custom URL toggle**

Add new state after line 33:

```typescript
const [customUrl, setCustomUrl] = useState('')
const [showCustomInput, setShowCustomInput] = useState(false) // NEW
```

**Step 5: Add Link icon import**

Update imports at top:

```typescript
import { Link } from 'lucide-react'
```

**Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors

**Step 7: Commit**

```bash
git add src/components/onboarding/BlossomServerPicker.tsx
git commit -m "feat: update BlossomServerPicker modal styling

- Change to non-fullscreen modal (max-w-2xl)
- Enable progressive disclosure on server cards
- Make custom URL input collapsible
- Add Link icon to custom URL button"
```

---

## Task 3: Add Translation Keys

**Files:**
- Modify: `src/i18n/locales/en.json` (uploadOnboarding section)
- Modify: `src/i18n/locales/de.json` (uploadOnboarding section)
- Modify: `src/i18n/locales/fr.json` (uploadOnboarding section)
- Modify: `src/i18n/locales/es.json` (uploadOnboarding section)

**Step 1: Update English translations**

Find the `uploadOnboarding` section in `en.json` and update it:

```json
{
  "uploadOnboarding": {
    "title": "Configure Upload Servers",
    "description": "Choose where to upload and store your videos.",
    "uploadServers": {
      "title": "Upload Servers",
      "description": "Required - At least one server needed",
      "emptyState": "Click + to add server",
      "required": "At least one upload server is required"
    },
    "mirrorServers": {
      "title": "Mirror Servers",
      "description": "Optional - Backup copies for redundancy",
      "emptyState": "Click + to add server"
    },
    "continue": "Continue to Upload"
  }
}
```

**Step 2: Update German translations**

Update `de.json`:

```json
{
  "uploadOnboarding": {
    "title": "Upload-Server konfigurieren",
    "description": "Wählen Sie aus, wo Ihre Videos hochgeladen und gespeichert werden.",
    "uploadServers": {
      "title": "Upload-Server",
      "description": "Erforderlich - Mindestens ein Server benötigt",
      "emptyState": "Klicken Sie auf +, um Server hinzuzufügen",
      "required": "Mindestens ein Upload-Server ist erforderlich"
    },
    "mirrorServers": {
      "title": "Mirror-Server",
      "description": "Optional - Backup-Kopien zur Redundanz",
      "emptyState": "Klicken Sie auf +, um Server hinzuzufügen"
    },
    "continue": "Weiter zum Upload"
  }
}
```

**Step 3: Update French translations**

Update `fr.json`:

```json
{
  "uploadOnboarding": {
    "title": "Configurer les serveurs de téléchargement",
    "description": "Choisissez où télécharger et stocker vos vidéos.",
    "uploadServers": {
      "title": "Serveurs de téléchargement",
      "description": "Requis - Au moins un serveur nécessaire",
      "emptyState": "Cliquez sur + pour ajouter un serveur",
      "required": "Au moins un serveur de téléchargement est requis"
    },
    "mirrorServers": {
      "title": "Serveurs miroir",
      "description": "Optionnel - Copies de sauvegarde pour la redondance",
      "emptyState": "Cliquez sur + pour ajouter un serveur"
    },
    "continue": "Continuer vers le téléchargement"
  }
}
```

**Step 4: Update Spanish translations**

Update `es.json`:

```json
{
  "uploadOnboarding": {
    "title": "Configurar servidores de subida",
    "description": "Elija dónde subir y almacenar sus videos.",
    "uploadServers": {
      "title": "Servidores de subida",
      "description": "Requerido - Se necesita al menos un servidor",
      "emptyState": "Haga clic en + para agregar servidor",
      "required": "Se requiere al menos un servidor de subida"
    },
    "mirrorServers": {
      "title": "Servidores espejo",
      "description": "Opcional - Copias de respaldo para redundancia",
      "emptyState": "Haga clic en + para agregar servidor"
    },
    "continue": "Continuar a la subida"
  }
}
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors

**Step 6: Commit**

```bash
git add src/i18n/locales/*.json
git commit -m "feat: update onboarding translations for cleaner UI

- Simplify descriptions
- Add emptyState translations
- Update all four languages (EN/DE/FR/ES)"
```

---

## Task 4: Redesign BlossomOnboardingStep Layout

**Files:**
- Modify: `src/components/onboarding/BlossomOnboardingStep.tsx:1-169`

**Step 1: Add lucide-react icon imports**

Update imports section (after line 7):

```typescript
import { Upload, RefreshCw, Plus } from 'lucide-react'
```

**Step 2: Replace Card content with two-column layout**

Replace the entire CardContent section (lines 68-142) with:

```typescript
<CardContent className="space-y-6">
  {/* Two-column grid */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {/* Upload Servers Column */}
    <div className="space-y-3">
      {/* Section Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('uploadOnboarding.uploadServers.title')}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('uploadOnboarding.uploadServers.description')}
        </p>
      </div>

      {/* Empty State or Server List */}
      {uploadServers.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('uploadOnboarding.uploadServers.emptyState')}</p>
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

      {/* Add Button */}
      <Button
        size="icon"
        variant="outline"
        onClick={() => setShowUploadPicker(true)}
        className="w-10 h-10"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>

    {/* Mirror Servers Column */}
    <div className="space-y-3">
      {/* Section Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('uploadOnboarding.mirrorServers.title')}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('uploadOnboarding.mirrorServers.description')}
        </p>
      </div>

      {/* Empty State or Server List */}
      {mirrorServers.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('uploadOnboarding.mirrorServers.emptyState')}</p>
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

      {/* Add Button */}
      <Button
        size="icon"
        variant="outline"
        onClick={() => setShowMirrorPicker(true)}
        className="w-10 h-10"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
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
```

**Step 3: Update Card header description**

Update line 65 to use simplified description:

```typescript
<CardDescription>{t('uploadOnboarding.description')}</CardDescription>
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No TypeScript errors

**Step 5: Test in browser**

Run: `npm run dev`
Navigate to upload page (not logged in or complete onboarding)
Expected: See two-column layout with dashed border empty states and + icon buttons

**Step 6: Commit**

```bash
git add src/components/onboarding/BlossomOnboardingStep.tsx
git commit -m "feat: redesign BlossomOnboardingStep with two-column layout

- Add Upload and RefreshCw icons to section headers
- Implement two-column grid (responsive to mobile)
- Add dashed border empty states with Plus icon
- Replace text buttons with icon-only + buttons
- Cleaner visual hierarchy and spacing"
```

---

## Task 5: Update CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` (Unreleased section)

**Step 1: Add changelog entry**

Add to the "### Changed" section under "## [Unreleased]":

```markdown
- **Blossom Onboarding Redesign**: Redesigned upload page Blossom server configuration with cleaner, more beginner-friendly UI. Two-column layout (upload/mirror servers side-by-side on desktop), icon-only + buttons, dashed border empty states, hover-based X buttons on server cards, progressive disclosure in server picker modal (minimal info by default, details on hover), non-fullscreen modal with single-click selection, collapsible custom URL input. Components: `BlossomOnboardingStep`, `BlossomServerPicker`, `ServerCard`. i18n support for EN/DE/FR/ES. Design document: `docs/plans/2025-12-14-blossom-onboarding-redesign.md`
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for blossom onboarding redesign"
```

---

## Task 6: Final Verification and Formatting

**Files:**
- All modified files

**Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript or ESLint errors

**Step 2: Run formatter**

Run: `npm run format`
Expected: All files formatted successfully

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Test in browser (comprehensive)**

Run: `npm run dev`

Test scenarios:
1. Navigate to /upload (not logged in or onboarding not complete)
2. Verify two-column layout appears on desktop
3. Verify single column stacks on mobile (resize browser)
4. Click + button on upload servers
5. Verify modal opens with server list
6. Hover over server cards to see details appear
7. Click a server to add it
8. Verify modal closes and server appears in list
9. Hover over added server card to see X button
10. Click X to remove server
11. Verify validation error appears when no upload servers
12. Add at least one upload server
13. Verify Continue button enables
14. Click + on mirror servers section
15. Add a mirror server (optional)
16. Click "Add custom server URL" link
17. Verify input field appears
18. Enter custom URL and click Add
19. Verify custom server appears in list
20. Click Continue
21. Verify onboarding completes and upload form appears

Expected: All interactions work smoothly, UI is clean and intuitive

**Step 5: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: run prettier formatting"
```

---

## Testing Strategy

**Manual Testing:**
- Test on desktop (≥768px width)
- Test on mobile (<768px width)
- Test all user interactions (add/remove servers, hover states, modal)
- Test validation (no upload servers, at least one required)
- Test all four languages (EN/DE/FR/ES)

**Visual Regression:**
- Compare before/after screenshots
- Verify dashed borders render correctly
- Verify icons are properly sized and aligned
- Verify hover effects are smooth

**Accessibility:**
- Verify keyboard navigation works
- Verify screen reader announcements
- Verify color contrast meets WCAG standards

---

## Success Criteria

- ✅ Two-column layout on desktop, single column on mobile
- ✅ Icon-only + buttons with lucide-react icons
- ✅ Dashed border empty states with centered Plus icon
- ✅ Hover-based X buttons on server cards (opacity transition)
- ✅ Progressive disclosure in modal (details on hover)
- ✅ Non-fullscreen modal (max-w-2xl)
- ✅ Single-click selection in modal
- ✅ Collapsible custom URL input
- ✅ All translations updated (EN/DE/FR/ES)
- ✅ No TypeScript errors
- ✅ No ESLint warnings
- ✅ Build succeeds
- ✅ All tests pass
- ✅ CHANGELOG updated

---

## Notes

- **DRY:** Reuse existing `ServerCard` component with new prop
- **YAGNI:** Don't add features beyond the design spec
- **TDD:** Manual testing required (UI-focused changes)
- **Commits:** Small, focused commits for each component change

## Rollback Plan

If issues arise:
1. Check git log: `git log --oneline`
2. Identify last good commit before changes
3. Revert: `git revert <commit-sha>` for each commit in reverse order
4. Or reset branch: `git reset --hard <last-good-commit>`
