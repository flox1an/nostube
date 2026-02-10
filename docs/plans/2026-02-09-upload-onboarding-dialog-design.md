# Upload Onboarding Dialog

## Problem

New users who click Upload for the first time have no Blossom servers configured. Currently they see a broken "Use recommended servers" button, an intimidating "Advanced" button, and a yellow warning box blocking the dropzone. There's no clear path forward.

## Solution

A modal dialog that appears automatically when the upload page loads with 0 servers configured. It explains the primary/mirror model in plain language, then either auto-configures sensible defaults with one click or lets the user pick their own servers.

## Dialog Trigger & Lifecycle

- **Appears when:** Upload page mounts and `config.blossomServers.length === 0`
- **Disappears when:** User clicks "Get Started" (servers auto-configured) or "Choose my own servers" (server picker opens)
- **No "seen" flag persisted.** Condition is purely "do you have servers?" — if they somehow clear settings, it shows again
- **Modal:** Cannot interact with upload page behind it. No X button, no backdrop dismiss.

## Dialog Content & Layout

Compact dialog (~400px wide), no title bar.

### Visual Flow (top)

Three icons connected by arrows:

```
[Your Device] ---> [Primary Server] - - -> [Backup Servers]
```

- Solid arrow from Device to Primary (your upload)
- Dashed/sparkle arrow from Primary to Backups (automatic copy)
- Labels underneath each icon

### Explanation Text (middle)

> "You upload your video once to a primary server. It's then automatically copied to backup servers for resilience — no extra bandwidth on your end. You can change servers anytime in Settings > Video Hosting."

### Buttons (bottom)

- **"Get Started"** — primary button, full width. Auto-configures default servers.
- **"Choose my own servers"** — subtle text link below. Opens existing `BlossomOnboardingStep` server picker.

## Default Server Configuration

"Get Started" configures:

| Server               | Role                     | Notes                                        |
| -------------------- | ------------------------ | -------------------------------------------- |
| `blossom.primal.net` | Primary (initial upload) | Bunny CDN, free, reliable                    |
| `nostr.download`     | Mirror (backup)          | Free, supports mirror endpoint               |
| `24242.io`           | Mirror (backup)          | Bunny CDN, free, 100MB max, 60-day retention |

## Implementation

### New Component

`src/components/video-upload/UploadOnboardingDialog.tsx`

Props: `open: boolean`, `onComplete: () => void`

### "Get Started" Handler

1. Build server array:
   - `{ url: "https://blossom.primal.net", name: "Primal", tags: ["initial upload"] }`
   - `{ url: "https://nostr.download", name: "nostr.download", tags: ["mirror"] }`
   - `{ url: "https://24242.io", name: "24242.io", tags: ["mirror"] }`
2. Call `setConfig({ ...config, blossomServers: servers })`
3. Close dialog

### "Choose my own servers" Handler

1. Close this dialog
2. Open `BlossomOnboardingStep` server picker via state flag in `VideoUpload.tsx`

### Dead Code Removal

- Remove `handleUseRecommendedServers()` from `VideoUpload.tsx`
- Remove yellow "no servers" warning box / disabled dropzone
- Remove "Use recommended servers" / "Advanced" buttons from info bar
- Keep the info bar itself (shows server counts after setup)

### i18n

All strings under `upload.onboarding.*` namespace in EN/DE/FR/ES.

## Future Consideration

Temporary upload servers — servers used only for uploading (fast staging) whose URLs are NOT included in the published event. Mirrors pull from them, and only mirror URLs go into imeta tags. This decouples upload speed from long-term hosting.
