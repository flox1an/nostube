# Jumble-Style Threading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Jumble-inspired threading UI/UX improvements for VideoComments.tsx including visual thread lines, smart collapse, reply-to context badges, improved highlighting, loading skeletons, and muted user handling.

**Architecture:** Enhance existing CommentItem component with CSS-based thread connection lines, add ParentPreview sub-component for reply context, integrate with Nostr mute lists via existing hooks, and improve expand/collapse behavior to auto-expand single replies.

**Tech Stack:** React, TypeScript, TailwindCSS, Zustand (existing store), lucide-react icons

---

## Task 1: Add Thread Connection Lines CSS

**Files:**

- Modify: `src/components/VideoComments.tsx:167-302`

**Step 1: Update CommentItem wrapper with relative positioning and thread lines**

Add vertical connector line and L-shaped branch connector to nested replies. The vertical line shows thread continuation, the L-connector shows parent-child relationship.

```tsx
// In the nested replies section (around line 259-282), update to:
{
  hasReplies && isExpanded && depth < maxDepth && (
    <div className="mt-2 relative">
      {comment.replies!.map((reply, index) => (
        <div key={reply.id} className="relative flex">
          {/* Vertical continuation line (for all but last reply) */}
          {index < comment.replies!.length - 1 && (
            <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
          )}
          {/* L-shaped connector from parent to this reply */}
          <div className="absolute left-3 top-0 h-5 w-4 rounded-bl-lg border-l border-b border-border" />
          <div className="flex-1 pl-6">
            <CommentItem
            // ... existing props
            />
          </div>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 2: Add Dashed/Solid Line Indicator for Collapsed State

**Files:**

- Modify: `src/components/VideoComments.tsx:225-237`

**Step 1: Update expand button with visual line indicator**

Replace the triangle indicators with chevron icons and add dashed/solid line visual cue.

```tsx
// Update imports at top of file:
import { Reply, MoreVertical, Flag, ChevronDown, ChevronUp } from 'lucide-react'

// Update the expand button (around line 225-237):
{
  hasReplies && depth < maxDepth && (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => onToggleExpanded(comment.id)}
    >
      {isExpanded ? (
        <>
          <ChevronUp className="w-3 h-3 mr-1" />
          {t('video.comments.hideReplies')} ({comment.replies!.length})
        </>
      ) : (
        <>
          <ChevronDown className="w-3 h-3 mr-1" />
          {t('video.comments.showReplies')} ({comment.replies!.length})
        </>
      )}
    </Button>
  )
}
```

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 3: Add i18n Translations for New Strings

**Files:**

- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/de.json`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/es.json`

**Step 1: Add new translation keys**

In each locale file, add these keys under `video.comments`:

```json
{
  "video": {
    "comments": {
      "showReplies": "Show replies",
      "hideReplies": "Hide replies",
      "replyingTo": "Replying to",
      "showMutedReply": "Show hidden reply"
    }
  }
}
```

Translations:

- DE: `"showReplies": "Antworten anzeigen"`, `"hideReplies": "Antworten ausblenden"`, `"replyingTo": "Antwort an"`, `"showMutedReply": "Ausgeblendete Antwort anzeigen"`
- FR: `"showReplies": "Afficher les réponses"`, `"hideReplies": "Masquer les réponses"`, `"replyingTo": "En réponse à"`, `"showMutedReply": "Afficher la réponse masquée"`
- ES: `"showReplies": "Mostrar respuestas"`, `"hideReplies": "Ocultar respuestas"`, `"replyingTo": "Respondiendo a"`, `"showMutedReply": "Mostrar respuesta oculta"`

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 4: Implement Auto-Expand for Single Reply

**Files:**

- Modify: `src/components/VideoComments.tsx:225-237`

**Step 1: Update expand logic to auto-show single replies**

Single replies should always be visible without needing to expand. Only show collapse button when >1 replies.

```tsx
// Around line 225-237, update the conditional:
{/* Only show expand/collapse when more than 1 reply */}
{hasReplies && comment.replies!.length > 1 && depth < maxDepth && (
  <Button
    variant="ghost"
    size="sm"
    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
    onClick={() => onToggleExpanded(comment.id)}
  >
    {isExpanded ? (
      <>
        <ChevronUp className="w-3 h-3 mr-1" />
        {t('video.comments.hideReplies')} ({comment.replies!.length})
      </>
    ) : (
      <>
        <ChevronDown className="w-3 h-3 mr-1" />
        {t('video.comments.showReplies')} ({comment.replies!.length})
      </>
    )}
  </Button>
)}

// Around line 259, update the render condition:
{/* Render replies: auto-show if only 1 reply, or if expanded for multiple */}
{hasReplies && (isExpanded || comment.replies!.length === 1) && depth < maxDepth && (
  // ... existing nested replies code
)}
```

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 5: Create ParentPreview Component for Reply Context

**Files:**

- Modify: `src/components/VideoComments.tsx`

**Step 1: Add ParentPreview sub-component**

Add a small pill-style badge that shows who the user is replying to when in deep threads.

```tsx
// Add after the Comment interface (around line 34):

interface ParentPreviewProps {
  parentId: string
  onClick?: () => void
}

const ParentPreview = React.memo(function ParentPreview({ parentId, onClick }: ParentPreviewProps) {
  const { t } = useTranslation()
  const eventStore = useEventStore()
  const parentEvent = eventStore.getEvent(parentId)
  const parentPubkey = parentEvent?.pubkey
  const metadata = useProfile(parentPubkey ? { pubkey: parentPubkey } : undefined)
  const name = metadata?.name || parentPubkey?.slice(0, 8) || '...'

  if (!parentEvent) return null

  const contentPreview =
    parentEvent.content.slice(0, 30) + (parentEvent.content.length > 30 ? '...' : '')

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        onClick?.()
      }}
      className="flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground hover:text-foreground transition-colors max-w-full"
    >
      <span className="shrink-0">{t('video.comments.replyingTo')}</span>
      {metadata?.picture && (
        <img src={metadata.picture} className="w-4 h-4 rounded-full shrink-0" alt="" />
      )}
      <span className="truncate">{name}</span>
      <span className="truncate text-muted-foreground/70">"{contentPreview}"</span>
    </button>
  )
})
```

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 6: Integrate ParentPreview in CommentItem

**Files:**

- Modify: `src/components/VideoComments.tsx:119-151` (props)
- Modify: `src/components/VideoComments.tsx:167-210` (render)

**Step 1: Add props for parent context**

```tsx
// Update CommentItem props (around line 135-150):
{
  comment: Comment
  link: string
  depth?: number
  parentComment?: Comment  // Add this
  onScrollToComment?: (commentId: string) => void  // Add this
  // ... rest of existing props
}
```

**Step 2: Add ParentPreview render in CommentItem**

```tsx
// After the username/timestamp row, before RichTextContent (around line 205):
{
  /* Show parent context when this is a nested reply to a different parent */
}
{
  depth > 0 && comment.replyToId && parentComment && (
    <div className="mt-1 mb-1">
      <ParentPreview
        parentId={comment.replyToId}
        onClick={() => onScrollToComment?.(comment.replyToId!)}
      />
    </div>
  )
}
```

**Step 3: Pass parent info when rendering nested replies**

```tsx
// In the nested replies map (around line 261-280):
{
  comment.replies!.map((reply, index) => (
    <div key={reply.id} className="relative flex">
      {/* ... thread lines ... */}
      <div className="flex-1 pl-6">
        <CommentItem
          comment={reply}
          link={link}
          depth={depth + 1}
          parentComment={comment} // Add this
          onScrollToComment={onScrollToComment} // Add this
          // ... rest of existing props
        />
      </div>
    </div>
  ))
}
```

**Step 4: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 7: Add Scroll-to and Highlight Function

**Files:**

- Modify: `src/components/VideoComments.tsx:305-600` (VideoComments component)

**Step 1: Add scroll handler in VideoComments**

```tsx
// Add inside VideoComments component (around line 330):
const scrollToComment = useCallback(
  (commentId: string) => {
    // First, expand all ancestors so the comment is visible
    const ancestors = useCommentHighlightStore.getState().getAncestorIds(commentId)
    useCommentHighlightStore.getState().expandComments(ancestors)

    // Wait for DOM update, then scroll
    setTimeout(() => {
      const element = document.getElementById(`comment-${commentId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        setHighlightedCommentId(commentId)
      }
    }, 100)
  },
  [setHighlightedCommentId]
)
```

**Step 2: Pass scrollToComment to CommentItem**

```tsx
// In the visibleThreadedComments.map (around line 580-598):
<CommentItem
  key={comment.id}
  comment={comment}
  link={link}
  onReply={user ? handleReply : undefined}
  replyingTo={replyTo?.id}
  replyContent={replyContent}
  onReplyContentChange={setReplyContent}
  onSubmitReply={handleReplySubmit}
  onCancelReply={cancelReply}
  expandedComments={expandedComments}
  onToggleExpanded={toggleExpanded}
  highlightedCommentId={highlightedCommentId}
  onScrollToComment={scrollToComment} // Add this
  currentUserAvatar={userProfile?.picture}
  currentUserName={userProfile?.name || user?.pubkey.slice(0, 8)}
  currentUserPubkey={user?.pubkey}
/>
```

**Step 3: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 8: Improve Highlight Animation CSS

**Files:**

- Modify: `src/index.css`
- Modify: `src/components/VideoComments.tsx:168`

**Step 1: Update CSS for smoother highlight animation**

```css
/* Update in src/index.css around line 255 */
.highlight-comment {
  animation: highlight-fade 1.5s ease-out;
}

@keyframes highlight-fade {
  0% {
    background-color: hsl(var(--primary) / 0.3);
  }
  70% {
    background-color: hsl(var(--primary) / 0.2);
  }
  100% {
    background-color: transparent;
  }
}
```

**Step 2: Add transition class to CommentItem wrapper**

```tsx
// Around line 168, update the wrapper div:
<div
  id={`comment-${comment.id}`}
  className={`transition-colors duration-500 ${isHighlighted ? 'highlight-comment' : ''}`}
>
```

**Step 3: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 9: Add CommentSkeleton Component

**Files:**

- Modify: `src/components/VideoComments.tsx`

**Step 1: Add skeleton component and imports**

```tsx
// Add to imports at top:
import { Skeleton } from '@/components/ui/skeleton'

// Add after ParentPreview component (around line 75):
export function CommentSkeleton({ depth = 0 }: { depth?: number }) {
  const isRootComment = depth === 0
  const avatarSize = isRootComment ? 'h-10 w-10' : 'h-6 w-6'

  return (
    <div className="flex gap-3 pb-4">
      <Skeleton className={`${avatarSize} rounded-full shrink-0`} />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-14" />
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 10: Integrate Muted User Handling

**Files:**

- Modify: `src/components/VideoComments.tsx`

**Step 1: Add useMuteList hook import and usage**

```tsx
// Check if useMuteList hook exists, if so import it:
import { useMuteList } from '@/hooks'

// In CommentItem, add state for showing muted content:
const [showMuted, setShowMuted] = useState(false)

// Get mute list
const { mutedPubkeys } = useMuteList?.() ?? { mutedPubkeys: new Set() }
const isMuted = mutedPubkeys?.has(comment.pubkey) && !showMuted

// Wrap content rendering:
{isMuted ? (
  <Button
    variant="outline"
    size="sm"
    className="text-xs text-muted-foreground mt-1"
    onClick={() => setShowMuted(true)}
  >
    {t('video.comments.showMutedReply')}
  </Button>
) : (
  <>
    <RichTextContent ... />
    {/* reactions, reply button, etc */}
  </>
)}
```

Note: If useMuteList hook doesn't exist, skip this task and note it as future work.

**Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

---

## Task 11: Final Integration and Testing

**Files:**

- Modify: `src/components/VideoComments.tsx` (final cleanup)

**Step 1: Run full build and format**

Run: `npm run build && npm run format`
Expected: Build succeeds, code formatted

**Step 2: Test manually**

1. Open a video with comments
2. Verify thread lines appear for nested replies
3. Verify single reply auto-expands
4. Verify multiple replies collapse with chevron button
5. Verify clicking "Replying to" badge scrolls and highlights parent
6. Verify highlight animation works smoothly

**Step 3: Commit**

```bash
git add src/components/VideoComments.tsx src/index.css src/i18n/locales/*.json
git commit -m "feat(comments): add Jumble-style threading UI improvements

- Add visual thread connection lines (vertical + L-shaped connectors)
- Auto-expand single replies, collapse multiple with chevron icons
- Add ParentPreview pill for reply context in deep threads
- Add scroll-to and highlight animation for parent navigation
- Add CommentSkeleton component for loading states
- Improve highlight animation with smoother fade
- Add i18n translations for new UI strings"
```

---

## Summary

This plan implements 6 key Jumble-inspired improvements:

1. **Thread connection lines** - Visual CSS borders connecting replies
2. **Smart collapse** - Auto-expand single replies, collapse multiple
3. **Reply-to context** - ParentPreview pill showing who you're replying to
4. **Scroll & highlight** - Smooth scroll to parent with temporary highlight
5. **Loading skeletons** - CommentSkeleton component
6. **i18n support** - New translation strings for all 4 locales

Muted user handling is optional and depends on existing hook availability.
