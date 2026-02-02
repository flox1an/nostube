# Blossom Terminology Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace technical Blossom terminology with user-friendly hosting metaphor across all UI.

**Architecture:** Update i18n translation keys and component text. No data model changes - internal code keeps existing names (`blossomServers`, `cachingServers`, tag values `'mirror'`, `'initial upload'`). Only user-facing labels change.

**Tech Stack:** React, i18next, TypeScript

---

## Task 1: Update English Translations

**Files:**

- Modify: `src/i18n/locales/en.json`

**Step 1: Update settings.blossom section**

Replace lines 482-492:

```json
    "blossom": {
      "title": "Video Hosting",
      "description": "Manage servers where your videos are stored.",
      "noServers": "No hosting servers configured. Add some below or reset to defaults.",
      "addPlaceholder": "Add server URL (e.g., https://blossom.primal.net)",
      "addButton": "Add Server",
      "resetButton": "Reset to Defaults",
      "mirror": "Backup",
      "initialUpload": "Primary",
      "blockedServer": "Server Blocked",
      "blockedServerDescription": "This server re-encodes videos and serves low-quality content. It cannot be added."
    },
```

**Step 2: Update settings.caching section**

Replace lines 494-500:

```json
    "caching": {
      "title": "Streaming Servers",
      "description": "Servers that deliver videos for playback. Optional - improves streaming speed.",
      "noServers": "No streaming servers configured. Videos will play directly from hosting servers.",
      "addPlaceholder": "Add streaming server URL",
      "addButton": "Add Server",
      "resetButton": "Reset to Defaults"
    },
```

**Step 3: Update upload error messages**

Replace lines 270-271:

```json
    "noUploadServers": "No hosting servers are set as Primary.",
    "configureServers": "Go to Settings → Video Hosting and mark at least one server as Primary.",
```

**Step 4: Update onboarding blossom section**

Replace lines 756-776:

```json
    "blossom": {
      "title": "Configure Video Hosting",
      "uploadSection": {
        "title": "Primary Servers",
        "description": "Where your videos are uploaded. Select at least one.",
        "required": "At least one primary server is required"
      },
      "mirrorSection": {
        "title": "Backup Servers (Optional)",
        "description": "Additional servers for redundancy and faster access worldwide."
      },
      "serverInfo": {
        "free": "Free",
        "paid": "Paid",
        "supportsMirror": "Supports backup",
        "maxSize": "Max size",
        "retention": "Retention",
        "unlimited": "Unlimited",
        "noLimit": "No limit"
      },
      "continue": "Continue",
      "stepIndicator": "Step {{current}} of {{total}}"
    }
```

**Step 5: Update uploadOnboarding section**

Replace lines 779-793:

```json
  "uploadOnboarding": {
    "title": "Configure Video Hosting",
    "description": "Choose where to upload and store your videos.",
    "uploadServers": {
      "title": "Primary Servers",
      "description": "Required - At least one server needed",
      "emptyState": "Click + to add server",
      "required": "At least one primary server is required"
    },
    "mirrorServers": {
      "title": "Backup Servers",
      "description": "Optional - Extra copies for reliability",
      "emptyState": "Click + to add server"
    },
    "continue": "Continue to Upload"
  },
```

**Step 6: Update blossomPicker section**

Replace lines 795-810:

```json
  "blossomPicker": {
    "upload": {
      "title": "Select Primary Server",
      "description": "Choose a server from the list or add a custom URL."
    },
    "mirror": {
      "title": "Select Backup Server",
      "description": "Choose a server to store backup copies of your videos."
    },
    "noServersAvailable": "All available servers have been added.",
    "customUrl": {
      "label": "Custom Server URL",
      "placeholder": "https://your-server.com",
      "add": "Add",
      "hint": "Enter the full URL of a compatible server"
    }
  },
```

**Step 7: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add src/i18n/locales/en.json
git commit -m "feat(i18n): update English translations with hosting terminology"
```

---

## Task 2: Update German Translations

**Files:**

- Modify: `src/i18n/locales/de.json`

**Step 1: Read current German translations**

Read the file to find corresponding sections.

**Step 2: Update settings.blossom section**

```json
    "blossom": {
      "title": "Video-Hosting",
      "description": "Server verwalten, auf denen deine Videos gespeichert werden.",
      "noServers": "Keine Hosting-Server konfiguriert. Füge unten welche hinzu oder setze auf Standard zurück.",
      "addPlaceholder": "Server-URL hinzufügen (z.B. https://blossom.primal.net)",
      "addButton": "Server hinzufügen",
      "resetButton": "Auf Standard zurücksetzen",
      "mirror": "Backup",
      "initialUpload": "Primär",
      "blockedServer": "Server blockiert",
      "blockedServerDescription": "Dieser Server konvertiert Videos neu und liefert minderwertige Qualität. Er kann nicht hinzugefügt werden."
    },
```

**Step 3: Update settings.caching section**

```json
    "caching": {
      "title": "Streaming-Server",
      "description": "Server für die Videowiedergabe. Optional - verbessert die Streaming-Geschwindigkeit.",
      "noServers": "Keine Streaming-Server konfiguriert. Videos werden direkt von Hosting-Servern abgespielt.",
      "addPlaceholder": "Streaming-Server-URL hinzufügen",
      "addButton": "Server hinzufügen",
      "resetButton": "Auf Standard zurücksetzen"
    },
```

**Step 4: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/i18n/locales/de.json
git commit -m "feat(i18n): update German translations with hosting terminology"
```

---

## Task 3: Update French Translations

**Files:**

- Modify: `src/i18n/locales/fr.json`

**Step 1: Read current French translations**

Read the file to find corresponding sections.

**Step 2: Update settings.blossom section**

```json
    "blossom": {
      "title": "Hébergement vidéo",
      "description": "Gérer les serveurs où vos vidéos sont stockées.",
      "noServers": "Aucun serveur d'hébergement configuré. Ajoutez-en ci-dessous ou réinitialisez aux valeurs par défaut.",
      "addPlaceholder": "Ajouter l'URL du serveur (ex: https://blossom.primal.net)",
      "addButton": "Ajouter un serveur",
      "resetButton": "Réinitialiser",
      "mirror": "Sauvegarde",
      "initialUpload": "Principal",
      "blockedServer": "Serveur bloqué",
      "blockedServerDescription": "Ce serveur réencode les vidéos et fournit un contenu de mauvaise qualité. Il ne peut pas être ajouté."
    },
```

**Step 3: Update settings.caching section**

```json
    "caching": {
      "title": "Serveurs de streaming",
      "description": "Serveurs pour la lecture vidéo. Optionnel - améliore la vitesse de streaming.",
      "noServers": "Aucun serveur de streaming configuré. Les vidéos seront lues directement depuis les serveurs d'hébergement.",
      "addPlaceholder": "Ajouter l'URL du serveur de streaming",
      "addButton": "Ajouter un serveur",
      "resetButton": "Réinitialiser"
    },
```

**Step 4: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/i18n/locales/fr.json
git commit -m "feat(i18n): update French translations with hosting terminology"
```

---

## Task 4: Update Spanish Translations

**Files:**

- Modify: `src/i18n/locales/es.json`

**Step 1: Read current Spanish translations**

Read the file to find corresponding sections.

**Step 2: Update settings.blossom section**

```json
    "blossom": {
      "title": "Alojamiento de vídeos",
      "description": "Administrar servidores donde se almacenan tus vídeos.",
      "noServers": "No hay servidores de alojamiento configurados. Añade algunos abajo o restablece los valores predeterminados.",
      "addPlaceholder": "Añadir URL del servidor (ej: https://blossom.primal.net)",
      "addButton": "Añadir servidor",
      "resetButton": "Restablecer",
      "mirror": "Copia de seguridad",
      "initialUpload": "Principal",
      "blockedServer": "Servidor bloqueado",
      "blockedServerDescription": "Este servidor recodifica los vídeos y ofrece contenido de baja calidad. No se puede añadir."
    },
```

**Step 3: Update settings.caching section**

```json
    "caching": {
      "title": "Servidores de streaming",
      "description": "Servidores para reproducción de vídeo. Opcional - mejora la velocidad de streaming.",
      "noServers": "No hay servidores de streaming configurados. Los vídeos se reproducirán directamente desde los servidores de alojamiento.",
      "addPlaceholder": "Añadir URL del servidor de streaming",
      "addButton": "Añadir servidor",
      "resetButton": "Restablecer"
    },
```

**Step 4: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/i18n/locales/es.json
git commit -m "feat(i18n): update Spanish translations with hosting terminology"
```

---

## Task 5: Move Thumbnail Server to General Settings (Advanced)

**Files:**

- Modify: `src/i18n/locales/en.json`

**Step 1: Update thumbnail server description to indicate it's advanced**

In `settings.general` section, update line 455-456:

```json
      "thumbnailServer": "Thumbnail Server URL (Advanced)",
      "thumbnailServerDescription": "Server for resizing thumbnails. Most users don't need to change this.",
```

**Step 2: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/i18n/locales/en.json
git commit -m "feat(i18n): mark thumbnail server as advanced setting"
```

---

## Task 6: Update Settings Navigation Icons

**Files:**

- Modify: `src/pages/settings/SettingsLayout.tsx`

**Step 1: Update imports to use more intuitive icons**

Replace line 4:

```tsx
import {
  Settings,
  Palette,
  Radio,
  HardDrive,
  Play,
  Database,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
```

**Step 2: Update menuItems array**

Replace lines 13-21:

```tsx
const menuItems: SettingsMenuItem[] = [
  { path: 'general', labelKey: 'settings.general.title', icon: Settings },
  { path: 'presets', labelKey: 'settings.presets.title', icon: Palette },
  { path: 'relays', labelKey: 'settings.relays.title', icon: Radio },
  { path: 'blossom', labelKey: 'settings.blossom.title', icon: HardDrive },
  { path: 'caching', labelKey: 'settings.caching.title', icon: Play },
  { path: 'cache', labelKey: 'settings.cache.title', icon: Trash2 },
  { path: 'missing-videos', labelKey: 'settings.missingVideos.title', icon: AlertTriangle },
]
```

**Step 3: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/pages/settings/SettingsLayout.tsx
git commit -m "feat(ui): update settings icons for hosting/streaming"
```

---

## Task 7: Final Verification

**Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run format check**

Run: `npm run format`

**Step 3: Update CHANGELOG.md**

Add under `[Unreleased]` → `### Changed`:

```markdown
- Settings: renamed "Blossom Servers" to "Video Hosting" with "Primary"/"Backup" badges (was "initial upload"/"mirror")
- Settings: renamed "Media Caching Servers" to "Streaming Servers" for clearer purpose
- Settings: marked Thumbnail Resize Server as advanced setting with updated description
- i18n: updated all languages (EN/DE/FR/ES) with new hosting terminology throughout upload, onboarding, and settings flows
```

**Step 4: Commit changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog for terminology redesign"
```

---

## Summary

| Task | Description                | Files                                   |
| ---- | -------------------------- | --------------------------------------- |
| 1    | English translations       | `src/i18n/locales/en.json`              |
| 2    | German translations        | `src/i18n/locales/de.json`              |
| 3    | French translations        | `src/i18n/locales/fr.json`              |
| 4    | Spanish translations       | `src/i18n/locales/es.json`              |
| 5    | Mark thumbnail as advanced | `src/i18n/locales/en.json`              |
| 6    | Update settings icons      | `src/pages/settings/SettingsLayout.tsx` |
| 7    | Final verification         | `CHANGELOG.md`                          |

Total: ~30 minutes of focused work
