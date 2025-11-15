# Default Relay & Blossom Server Configuration

**Date**: 2025-01-15
**Status**: Approved

## Goal

Ensure all new users (first-time visitors, anonymous users, and first-time login users) start with `wss://relay.divine.video` relay and `https://almond.slidestr.net` blossom server configured with appropriate tags.

## Target Users

- First-time visitors (no saved config in localStorage)
- Users browsing without logging in
- Users logging in for the first time

## Approach

Modify the default configuration constants to include these new settings. This leverages the existing architecture where `AppProvider` uses `defaultConfig` from `App.tsx`, which is applied when localStorage is empty.

### Why This Approach

1. **Simplicity**: No new logic needed; just update constants
2. **Consistency**: Both anonymous and authenticated users get the same starting configuration
3. **No migration needed**: Existing users keep their saved configs; only new users get the updated defaults

## Implementation

### Changes to `src/constants/relays.ts`

Add new entries to the preset arrays:

```typescript
export const presetRelays: Relay[] = [
  { url: 'wss://relay.divine.video', name: 'Divine Video', tags: ['read'] }, // NEW - prioritized for new users
  { url: 'wss://ditto.pub/relay', name: 'Ditto', tags: ['read'] },
  { url: 'wss://relay.nostr.band', name: 'Nostr.Band', tags: ['read'] },
  { url: 'wss://relay.damus.io', name: 'Damus', tags: ['read'] },
  { url: 'wss://relay.primal.net', name: 'Primal', tags: ['read'] },
  { url: 'wss://nos.lol/', name: 'nos.lol', tags: ['read'] },
]

export const presetBlossomServers: BlossomServer[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'Almond Slidestr',
    tags: ['proxy', 'initial upload'],
  },
]
```

### Automatic Propagation

The `defaultConfig` in `App.tsx` already uses these constants:

- `relays: presetRelays`
- `blossomServers: [...presetBlossomServers]`

No changes needed to `App.tsx` - it will automatically pick up the new defaults.

## Edge Cases

1. **Existing users**: Their saved localStorage config remains untouched
2. **Users who customized relays**: "Reset to Default Servers" button will include the new relay/blossom server
3. **First-time login**: Users already have these defaults from when they first visited the app
4. **URL normalization**: Existing `normalizeServerUrl` function handles the blossom URL correctly

## Testing

### Manual Testing

1. **First-time visitor**:
   - Clear browser localStorage
   - Open app in incognito mode
   - Verify `wss://relay.divine.video` in Settings → Relay Settings
   - Verify `https://almond.slidestr.net` in Settings → Blossom Servers with 'proxy' and 'initial upload' badges

2. **Existing user**:
   - Verify old configuration is preserved
   - Click "Reset to Default Servers" and verify new defaults appear

3. **Relay connection**:
   - Check DevTools → Network → WS for connection to `wss://relay.divine.video`
   - Verify video content loads properly

4. **Blossom upload**:
   - Upload a video
   - Verify upload attempts to `https://almond.slidestr.net`
   - Check proxy functionality for video playback

### Automated Testing

No unit tests needed - this is a configuration change that leverages existing, tested logic.

## Rollback

If issues arise, simply revert changes to `src/constants/relays.ts`. No database migrations or complex rollbacks required.

## Documentation

- Update CHANGELOG.md with new default settings
- Add inline comments explaining prioritization for new users

## Estimated Effort

- Implementation: ~5 minutes
- Testing: ~10 minutes
