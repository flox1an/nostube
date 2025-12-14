# Blossom Onboarding Redesign

**Date:** 2025-12-14
**Status:** Design
**Goal:** Redesign the upload page Blossom onboarding to be more beginner-friendly with a cleaner, more intuitive interface.

## Problem Statement

The current Blossom onboarding step (`BlossomOnboardingStep.tsx`) requires newcomers to configure upload and mirror servers before their first upload. While functional, the current design has several usability issues:

1. **Visual clutter:** Full server details shown upfront create information overload
2. **Button design:** Text buttons ("Add Upload Server", "Add Mirror Server") are verbose and don't follow modern minimal design patterns
3. **Layout inefficiency:** Vertical stacking makes the relationship between upload/mirror servers unclear
4. **No progressive disclosure:** All information shown at once, overwhelming first-time users

## Design Principles

1. **Deliberate selection:** Require manual server selection to help users understand what they're configuring (no pre-selected defaults)
2. **Progressive disclosure:** Start with minimal information, reveal details on interaction
3. **Clean visual hierarchy:** Use icons and spacing to reduce cognitive load
4. **Clear visual separation:** Make upload vs. mirror distinction obvious through layout

## Overall Layout and Structure

### Two-Column Layout

**Desktop (≥768px):** Side-by-side columns for upload and mirror servers
**Mobile (<768px):** Stacked vertically

**Card Structure:**
```
┌─────────────────────────────────────────────────┐
│  Configure Upload Servers                       │
│  [simplified description]                       │
│                                                  │
│  ┌────────────────────┬────────────────────┐   │
│  │ Upload Servers     │ Mirror Servers     │   │
│  │ [required]         │ [optional]         │   │
│  ├────────────────────┼────────────────────┤   │
│  │ [empty state or    │ [empty state or    │   │
│  │  server cards]     │  server cards]     │   │
│  │                    │                    │   │
│  │     [+ button]     │     [+ button]     │   │
│  └────────────────────┴────────────────────┘   │
│                                                  │
│                        [Continue to Upload] ──→ │
└─────────────────────────────────────────────────┘
```

### Section Headers

Each column has a header with:
- **Icon:** `Upload` (lucide-react) for upload servers, `RefreshCw` for mirror servers
- **Title:** "Upload Servers" / "Mirror Servers (Optional)"
- **Brief description:** One-line explanation below title

### Empty State

When no servers are configured:
```
┌──────────────────────────┐
│    ╭ ─ ─ ─ ─ ─ ─ ─ ╮    │
│    ┆               ┆    │
│    ┆      ⊕        ┆    │  (dashed border card)
│    ┆               ┆    │
│    ┆ Click + to add┆    │
│    ╰ ─ ─ ─ ─ ─ ─ ─ ╯    │
└──────────────────────────┘
```

- Dashed border card (`border-2 border-dashed`)
- Centered `Plus` icon from lucide-react
- Helper text: "Click + to add server"
- Subtle muted colors

### Server List (After Adding)

Compact server cards stacked vertically:
- Server name (bold)
- Payment badge (Free/Paid)
- X button appears only on hover (top-right corner)
- Minimal spacing between cards

### Add Button

- Circular icon-only button with `Plus` icon
- Size: `size="icon"` variant
- Positioned below the server list or empty state
- No text label (icon is self-explanatory)

### Validation

- **Upload servers required:** Red border around upload section if empty when continuing
- **Helper text:** "At least one upload server is required" (shown on validation error)
- **Continue button:** Disabled until ≥1 upload server configured

## Server Picker Modal Design

### Modal Appearance

- **Not full-screen:** Centered modal dialog (~600px max-width)
- **Title:** Context-aware - "Add Upload Server" or "Add Mirror Server"
- **Subtitle:** Brief explanation (e.g., "Choose a server to host your videos")
- **Scrollable list:** Available servers, excluding already-selected ones

### Server Cards in Modal

**Default State (Minimal):**
- Server name (bold, prominent)
- Payment badge (Free with secondary variant, Paid with orange background)
- Hover cursor indicating clickability
- Clean spacing, no visual clutter

**Hover State (Progressive Disclosure):**
Card expands to reveal:
- CDN provider (if available)
- File size limits with `HardDrive` icon
- Retention policy
- Price (if paid tier)
- "Supports mirroring" with `Check` icon (if applicable)
- Subtle border highlight or background color change
- Smooth transition animation

**Interaction:**
- **Single click anywhere on card** → Adds server and closes modal immediately
- No confirm button needed (instant feedback)
- Modal closes automatically after selection

### Custom URL Option

- Small text button at bottom of modal
- Icon: `Link` from lucide-react
- Text: "Add custom server URL"
- Click reveals inline text input with OK/Cancel buttons
- Validates URL format before allowing addition

## Icon Reference (lucide-react)

| Element | Icon | Purpose |
|---------|------|---------|
| Upload servers header | `Upload` | Indicates upload functionality |
| Mirror servers header | `RefreshCw` | Indicates mirroring/redundancy |
| Empty state placeholder | `Plus` | Add action affordance |
| Add server buttons | `Plus` | Primary action |
| Remove button (hover) | `X` | Delete/remove action |
| Server features | `Check` | Indicates supported features |
| Storage info | `HardDrive` | File size/storage context |
| Custom URL button | `Link` | External/custom URL |

## Component Changes

### BlossomOnboardingStep.tsx

**Layout Changes:**
- Add two-column grid: `grid grid-cols-1 md:grid-cols-2 gap-6`
- Each column wrapped in `<div className="space-y-3">`
- Section headers include icon + title in flex row

**Empty State:**
```tsx
<div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
  <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
  <p className="text-sm">{t('uploadOnboarding.uploadServers.emptyState')}</p>
</div>
```

**Add Button:**
```tsx
<Button size="icon" variant="outline" onClick={() => setShowUploadPicker(true)}>
  <Plus className="h-4 w-4" />
</Button>
```

**Server Cards:**
- Map over selected servers
- Pass `onRemove` callback to ServerCard
- Hover-based X button handled in ServerCard component

### ServerCard.tsx

**New Props:**
```tsx
interface ServerCardProps {
  server: BlossomServerInfo

  // Existing (keep for backward compatibility)
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void

  // New modes
  selectable?: boolean // For picker modal - shows minimal info
  showDetailsOnHover?: boolean // Progressive disclosure in modal
  onRemove?: () => void // Shows X button on hover
}
```

**Hover-Based Remove Button:**
```tsx
<div className="group relative ...">
  {/* Card content */}
  {onRemove && (
    <Button
      variant="ghost"
      size="icon"
      onClick={onRemove}
      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <X className="h-4 w-4" />
    </Button>
  )}
</div>
```

**Progressive Disclosure (Modal Mode):**
```tsx
{showDetailsOnHover ? (
  <>
    {/* Minimal info always visible */}
    <div className="font-medium">{server.name}</div>
    <Badge>{server.payment}</Badge>

    {/* Details revealed on hover */}
    <div className="hidden group-hover:block transition-all">
      {server.cdnProvider && <div>CDN: {server.cdnProvider}</div>}
      {/* ... other details */}
    </div>
  </>
) : (
  // Full details always visible (current behavior)
)}
```

### BlossomServerPicker.tsx

**Dialog Changes:**
- Remove full-screen mode
- Add `className="max-w-2xl"` to Dialog content
- Server cards use `showDetailsOnHover={true}` mode
- Remove footer with confirm button
- Cards are directly clickable → call `onSelect(url)` immediately

**Custom URL Section:**
```tsx
<div className="border-t pt-4 mt-4">
  <Button variant="ghost" size="sm" onClick={() => setShowCustomInput(true)}>
    <Link className="h-4 w-4 mr-2" />
    Add custom server URL
  </Button>

  {showCustomInput && (
    <div className="flex gap-2 mt-2">
      <Input
        placeholder="https://..."
        value={customUrl}
        onChange={e => setCustomUrl(e.target.value)}
      />
      <Button onClick={handleAddCustom}>OK</Button>
      <Button variant="outline" onClick={() => setShowCustomInput(false)}>Cancel</Button>
    </div>
  )}
</div>
```

## Translation Updates

Update `en.json` (and other locales):

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

## Visual Design Details

### Colors & Styling

- **Dashed borders:** `border-dashed border-muted-foreground/30`
- **Payment badges:**
  - Free: `variant="secondary"`
  - Paid: `bg-orange-500 hover:bg-orange-500/90`
- **Icons:** Muted foreground color by default, accent on hover
- **Hover transitions:** `transition-all duration-200`

### Spacing

- Section gap: `gap-6` (24px)
- Card spacing: `space-y-2` (8px between cards)
- Internal card padding: `p-3` (12px)
- Empty state padding: `p-8` (32px)

### Responsive Behavior

- **Mobile (<768px):** Single column, full width
- **Desktop (≥768px):** Two columns, equal width
- **Modal:** Always centered, max-width constrained regardless of screen size

## Implementation Checklist

- [ ] Update BlossomOnboardingStep.tsx with two-column layout
- [ ] Replace text buttons with icon-only `+` buttons
- [ ] Implement dashed border empty state
- [ ] Add section header icons (Upload, RefreshCw)
- [ ] Update ServerCard.tsx with hover-based X button
- [ ] Add `showDetailsOnHover` mode to ServerCard
- [ ] Update BlossomServerPicker.tsx to non-fullscreen modal
- [ ] Implement single-click selection in picker modal
- [ ] Add custom URL input section to picker
- [ ] Update all translation files (en/de/fr/es)
- [ ] Test responsive layout on mobile
- [ ] Test hover states and transitions
- [ ] Verify validation still works correctly
- [ ] Run build and format checks

## Success Metrics

**User Experience:**
- Newcomers can configure servers without reading documentation
- Clear visual distinction between required (upload) and optional (mirror) servers
- Reduced time to complete onboarding
- Less confusion about what each server type does

**Technical:**
- No breaking changes to existing functionality
- Backward compatible with existing ServerCard usage
- Maintains all validation logic
- Passes build and lint checks
- i18n support maintained across all languages
