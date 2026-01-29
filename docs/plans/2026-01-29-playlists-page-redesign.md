# Playlists Page Redesign

## Overview

Redesign the `/playlists` page from a dense accordion-based management interface to a visual card-based gallery that matches the design language of other nostube pages.

## Goals

1. **Visual consistency** - Match the look and feel of HomePage, AuthorPage, LikedVideosPage
2. **Clear separation of concerns** - `/playlists` manages playlist collection, `/playlist/:naddr` manages playlist contents
3. **Simplified UX** - Remove video-level operations from the overview page

## Design Decisions

| Decision | Choice |
|----------|--------|
| Primary use case | Playlist management (CRUD on playlists) |
| Card design | Thumbnail collage cover (1-4 videos) |
| Layout | Responsive grid (2-4 columns) |
| Card actions | Hover to reveal edit/delete |
| Create action | "+" card in grid (no header button) |
| Card click | Navigate to playlist detail page |

---

## Page Structure

### Container & Header

```tsx
<div className="max-w-560 mx-auto sm:p-4">
  <h1 className="text-2xl font-semibold mb-4">My Playlists</h1>
  <PlaylistGrid playlists={playlists} />
</div>
```

- Uses `max-w-560 mx-auto` container (matches other pages)
- Simple title, no header buttons
- Padding matches LikedVideosPage pattern

### Grid Layout

- Mobile (< 640px): 2 columns
- Tablet (640-1024px): 3 columns
- Desktop (> 1024px): 4 columns
- Gap: `gap-4`

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
  {playlists.map(playlist => <PlaylistCard key={playlist.identifier} />)}
  <CreatePlaylistCard />
</div>
```

### Empty State

When no playlists exist:
- Shows only the "+" create card
- Helper text below: "Create your first playlist to organize videos"

---

## Playlist Card Component

### Structure

```
┌─────────────────────────────┐
│                             │
│    Thumbnail Collage        │  ← 16:9 aspect ratio
│    (hover: edit/delete)     │
│                             │
├─────────────────────────────┤
│ Playlist Title              │  ← Single line, truncate
│ 12 videos                   │  ← Muted text
└─────────────────────────────┘
```

### Thumbnail Collage Layouts

Based on video count:

**0 videos:**
```
┌─────────────────┐
│                 │
│    📋 icon      │  ← Muted background
│                 │
└─────────────────┘
```

**1 video:**
```
┌─────────────────┐
│                 │
│   thumbnail 1   │  ← Full cover
│                 │
└─────────────────┘
```

**2 videos:**
```
┌────────┬────────┐
│        │        │
│   1    │   2    │  ← 50/50 split
│        │        │
└────────┴────────┘
```

**3 videos:**
```
┌────────┬────────┐
│        │   2    │
│   1    ├────────┤  ← Large left, two stacked right
│        │   3    │
└────────┴────────┘
```

**4+ videos:**
```
┌────────┬────────┐
│   1    │   2    │
├────────┼────────┤  ← 2x2 grid
│   3    │   4    │
└────────┴────────┘
```

### Hover State

- Card scales up slightly (`hover:scale-105`)
- Semi-transparent overlay appears on thumbnail
- Edit (pencil) and Delete (trash) icons appear in top-right
- Icons have dark backdrop for visibility

### Click Behavior

- Clicking card navigates to `/playlist/:naddr`
- Edit/delete buttons stop propagation and open respective dialogs

---

## Create Playlist Card

### Appearance

```
┌─────────────────────────────┐
│         - - - - -           │
│        |         |          │
│        |    +    |          │  ← Dashed border
│        |         |          │
│         - - - - -           │
├─────────────────────────────┤
│ New Playlist                │
└─────────────────────────────┘
```

- Same dimensions as playlist cards
- Dashed border: `border-2 border-dashed border-muted-foreground/30`
- Centered "+" icon (lucide `Plus`)
- "New Playlist" text below in muted color

### Interaction

- Hover: border brightens, subtle background tint
- Click: opens existing `CreatePlaylistDialog`

### Position

- Always last item in grid

---

## SinglePlaylistPage Enhancements

Video-level management moves here.

### Edit Mode

- "Edit" button in header (visible only to playlist owner)
- Toggles between view mode and edit mode

### View Mode (default)

- Clean VideoGrid display
- Click videos to watch
- No management UI visible

### Edit Mode

- Drag handles appear on video cards (grip icon)
- Delete buttons appear on hover
- Drag-and-drop to reorder
- Changes auto-save on drop

### Drag and Drop

Using `@dnd-kit/core` and `@dnd-kit/sortable`:

```tsx
<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={videoIds}>
    <VideoGrid>
      {videos.map(video => (
        <SortableVideoCard key={video.id} video={video} />
      ))}
    </VideoGrid>
  </SortableContext>
</DndContext>
```

On drag end:
1. Reorder video array locally
2. Call `updatePlaylist` with new video order
3. Publishes updated kind 30005 event

---

## Component Structure

### New Components

```
src/components/playlists/
├── PlaylistGrid.tsx           # Grid container with create card
├── PlaylistCard.tsx           # Individual playlist card
├── PlaylistThumbnailCollage.tsx  # Handles 0-4+ layouts
└── CreatePlaylistCard.tsx     # The "+" card
```

### Modified Files

| File | Changes |
|------|---------|
| `src/pages/Playlists.tsx` | Simplify to render PlaylistGrid |
| `src/pages/SinglePlaylistPage.tsx` | Add edit mode, drag-drop, delete |
| `src/components/PlaylistManager.tsx` | Delete (replaced by new components) |

### Reused Components

- `CreatePlaylistDialog` - No changes
- `AlertDialog` - For delete confirmation
- `Dialog` - For edit playlist dialog
- `VideoGrid` - For SinglePlaylistPage display

---

## Dependencies

Add to package.json:

```json
{
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "@dnd-kit/utilities": "^3.2.2"
}
```

These are lightweight, accessible, and well-maintained.

---

## Implementation Steps

### Phase 1: Playlists Page Redesign

1. Create `PlaylistThumbnailCollage` component
2. Create `PlaylistCard` component with hover actions
3. Create `CreatePlaylistCard` component
4. Create `PlaylistGrid` component
5. Update `Playlists.tsx` to use new components
6. Delete or archive `PlaylistManager.tsx`

### Phase 2: SinglePlaylistPage Enhancements

1. Install `@dnd-kit` packages
2. Add edit mode toggle to SinglePlaylistPage
3. Create `SortableVideoCard` wrapper component
4. Implement drag-and-drop reordering
5. Add delete video functionality in edit mode
6. Wire up auto-save on reorder

---

## Design Tokens

Using existing Tailwind classes for consistency:

| Element | Classes |
|---------|---------|
| Card container | `rounded-lg overflow-hidden bg-card` |
| Thumbnail area | `aspect-video relative` |
| Hover overlay | `absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100` |
| Action buttons | `p-1.5 rounded-full bg-black/60 hover:bg-black/80` |
| Card title | `font-medium line-clamp-1` |
| Video count | `text-sm text-muted-foreground` |
| Dashed border | `border-2 border-dashed border-muted-foreground/30` |

---

## Accessibility

- Keyboard navigation through grid
- Edit/delete buttons focusable
- Drag-and-drop has keyboard alternative (dnd-kit provides this)
- Screen reader announcements for drag operations
- Focus visible states on all interactive elements
