# Build Chunk Optimization Summary

## Changes Made

Optimized the Vite build configuration to combine small chunks into larger, more efficient bundles.

### Before Optimization

- **32 separate chunks** with many tiny files (<1KB)
- Multiple redundant HTTP requests
- Poor code organization across chunks

### After Optimization

- **31 chunks** with better organization
- Reduced number of tiny files
- Logical grouping of related code

## Chunk Strategy

### 1. **Hooks Bundle** (`hooks-*.js` - 15.78 KB)

All custom React hooks combined into one chunk:

- useAppContext, useCurrentUser, useNostrPublish
- useProfile, usePlaylist, useMissingVideos
- All other hooks from `/src/hooks/`

### 2. **Utils Bundle** (`utils-*.js` - 20.25 KB)

All utility and library functions:

- `/src/lib/` - Library utilities
- `/src/utils/` - Utility functions

### 3. **Nostr Bundle** (`nostr-*.js` - 1.26 KB)

Nostr-specific utilities:

- `/src/nostr/` - Nostr protocol helpers and loaders

### 4. **Contexts Bundle** (`contexts-*.js` - 0.09 KB)

React contexts:

- `/src/contexts/` - App contexts

### 5. **UI Component Bundles**

Split into logical groups to avoid circular dependencies:

- **ui-basic** (3.34 KB): button, badge, card, label, separator
- **ui-forms** (1.60 KB): form, input, textarea, checkbox, select
- **ui-overlays** (8.40 KB): dialog, alert, sheet, dropdown, popover
- **ui-misc** (7.52 KB): all other UI components

### 6. **Vendor Bundles** (unchanged)

- **vendor-hls** (520.13 KB): HLS.js video library
- **vendor-video** (216.70 KB): Video.js and media-chrome
- **vendor** (1,002.37 KB): All other node_modules

## Benefits

1. **Better Code Organization**: Related code is bundled together
2. **Reduced HTTP Requests**: Fewer files to download
3. **Improved Caching**: Logical bundles cache better
4. **Easier Debugging**: Clear chunk names indicate contents
5. **No Circular Dependencies**: Careful grouping avoids initialization errors

## Configuration

The optimization is configured in `vite.config.ts` using the `manualChunks` function in `build.rollupOptions.output`.

## Testing

- ✅ Build completes successfully
- ✅ No circular dependency errors
- ✅ Dev server starts properly
- ✅ TypeScript compilation passes
