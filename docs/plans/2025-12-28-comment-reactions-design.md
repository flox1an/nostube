# Comment Likes and Zaps Design

## Overview

Add reaction buttons (thumbs up/down) and zap functionality to comments, matching the existing video reactions UX.

## UI Layout

Each comment displays a row of ghost buttons below the content:

```
[Avatar] Author Name · 2h ago
Comment text goes here...

[👍 12] [👎] [⚡ 2.1k]
```

**Button specs:**

- Ghost variant (transparent background, subtle hover state)
- Small size to not overpower comment text
- Left-aligned, horizontal row with small gap
- Icons: `ThumbsUp`, `ThumbsDown`, `Zap` from lucide-react
- Filled icon variant when user has reacted/zapped
- Count appears next to icon only when ≥1

**Interactions:**

- Thumbs: single click toggles reaction
- Zap: click = 21 sats, long-press/right-click = custom amount dialog

## Nostr Protocol

**Reactions (kind 7):**

- Same as video reactions but referencing comment event ID
- Tags: `['e', commentId]`, `['p', commentAuthorPubkey]`, `['k', '1111']`
- Content: `'+'` for upvote, `'-'` for downvote
- Publish to: comment's seen relays + comment author's inbox relays + user's write relays

**Zaps (kind 9734/9735):**

- Zap request targets the comment event, not the video
- Tags include `['e', commentId]` instead of video event
- Receipts (9735) fetched same way as video zaps

**Fetching strategy:**

- Reuse existing `useReactions` hook, passing comment event
- Generalize `useVideoZaps` to work with any event (rename to `useEventZaps`)
- Load reactions/zaps when comment renders, not upfront for all comments

## Components & Files

**New component:**

- `CommentReactions.tsx` - thumbs up/down and zap buttons for a single comment

**Reused components:**

- `ZapDialog.tsx` - already works with any event
- `WalletConnectDialog.tsx` - no changes needed

**Hook changes:**

- Generalize `useVideoZaps.ts` → `useEventZaps.ts`
- `useReactions.ts` - already works with any event
- `useZap.ts` - already works with any event

**Integration:**

- Add `<CommentReactions event={comment} author={commentAuthor} />` in `VideoComments.tsx`
- Position below comment content, before reply components

**Files touched:**

1. `src/components/CommentReactions.tsx` (new)
2. `src/components/VideoComments.tsx` (add reactions component)
3. `src/hooks/useVideoZaps.ts` → rename to `useEventZaps.ts`
4. `src/components/ZapButton.tsx` (may extract shared logic)

## Edge Cases & Behavior

**Authentication:**

- Buttons visible but disabled for logged-out users
- Clicking when logged out shows login prompt
- Zap triggers wallet connect dialog if no wallet

**Own comments:**

- Cannot zap own comments (button disabled)
- Can react to own comments

**Nested comments:**

- Same reactions UI at all nesting levels
- Full-size reaction buttons for tap targets

**Loading states:**

- Show buttons immediately, counts appear when loaded
- Zap shows spinner while processing
- Optimistic update for reactions

**Cache:**

- Zap totals cached per comment in localStorage (1-hour TTL)
- Reactions stored in EventStore
