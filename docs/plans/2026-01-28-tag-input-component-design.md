# Tag Input Component with Autocomplete

## Overview

Create a reusable `TagInput` component with autocomplete suggestions from previously-used tags. The component will be used in upload, edit video, and label video dialogs.

## Architecture

### Tag Index (`src/hooks/useTagIndex.ts`)

Singleton index that tracks tag frequency from video events in the event store.

```typescript
interface TagIndexEntry {
  tag: string // lowercase normalized tag
  count: number // how many videos use this tag
}

// Exported functions/hook:
// - useTagIndex(): { searchTags: (query: string) => TagIndexEntry[], isReady: boolean }
// - Internally: getTagIndex(), indexVideoEvents(), searchTags()
```

**Behavior:**

- Built lazily on first access
- Subscribes to event store timeline for video kinds (21, 22, 34235, 34236)
- Extracts 't' tags from events, normalizes to lowercase
- Tracks frequency so popular tags rank higher
- Uses Set to track indexed event IDs (prevents duplicates)
- No relay fetching - indexes only what's in event store

### TagInput Component (`src/components/ui/tag-input.tsx`)

```typescript
interface TagInputProps {
  tags: string[]
  onTagsChange: (tags: string[]) => void
  placeholder?: string
  id?: string
  className?: string
}
```

**Features:**

- Text input with dropdown below when typing
- Dropdown shows matching tags (prefix match, sorted by frequency)
- Tag + count displayed (e.g., "bitcoin (42)")
- Max 8 visible suggestions, scrollable

**Add tag via:**

- Enter key (adds highlighted item or typed text)
- Click dropdown item
- Blur (if text present)
- Paste (space or comma separated)

**Keyboard navigation:**

- Arrow up/down to navigate dropdown
- Enter to select
- Escape to close dropdown

**Normalization:**

- Lowercase
- Strip leading `#`
- Deduplicate against existing tags

**Paste handling:**

```typescript
const handlePaste = (e: React.ClipboardEvent) => {
  const pastedText = e.clipboardData.getData('text')
  if (pastedText.includes(' ') || pastedText.includes(',')) {
    e.preventDefault()
    const newTags = [...inputValue, pastedText]
      .join(' ')
      .split(/[\s,]+/)
      .map(t => t.trim().replace(/^#/, '').toLowerCase())
      .filter(t => t.length > 0)

    const uniqueNew = [...new Set(newTags)].filter(t => !tags.includes(t))
    if (uniqueNew.length > 0) {
      onTagsChange([...tags, ...uniqueNew])
    }
    setInputValue('')
  }
}
```

**Display:**

- Tags shown as badges below input with X to remove
- Uses existing Badge component

## Integration

### Upload (FormFields.tsx)

- Replace Input + Badge rendering with `<TagInput />`
- Remove props: `tagInput`, `onTagInputChange`, `onAddTag`, `onPaste`, `onTagInputBlur`

### useVideoUpload.ts

- Remove: `tagInput` state, `setTagInput`, `addTagsFromInput`, `handleAddTag`, `handlePaste`
- Keep: `tags`, `setTags`, `removeTag` (though removeTag moves into TagInput)

### EditVideoDialog.tsx

- Replace comma-separated Input with `<TagInput />`
- Change `tags: string` state to `tags: string[]`
- Remove parsing logic on load/submit

### LabelVideoDialog.tsx

- Replace `hashtags: string` with `hashtags: string[]`
- Remove parsing logic

## Files

**Create:**

- `src/hooks/useTagIndex.ts`
- `src/components/ui/tag-input.tsx`

**Modify:**

- `src/components/video-upload/FormFields.tsx`
- `src/hooks/useVideoUpload.ts`
- `src/components/EditVideoDialog.tsx`
- `src/components/LabelVideoDialog.tsx`
- `src/hooks/index.ts` (export useTagIndex)

## UI Details

- Dropdown uses Popover positioned below input
- Matches input width
- Shows "tag (count)" format
- Highlights currently selected item
- Empty state: no dropdown shown
