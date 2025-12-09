# NIP-51 Follow Sets Migration Design

**Date:** 2025-12-09
**Status:** Approved

## Overview

Migrate nostube's subscription system from NIP-2 (kind 3 contact lists) to NIP-51 (kind 30000 follow sets) to enable better categorization and future follow management features.

## Motivation

- **NIP-51 Follow Sets** are designed for categorized follows, allowing users to organize subscriptions by topic/category
- **Future flexibility**: Enables multiple follow sets (e.g., "bitcoiners", "artists") without major refactoring
- **App-specific namespacing**: Using `d=nostube-follows` keeps nostube subscriptions separate from other apps
- **Modern standard**: NIP-51 is the recommended approach for follow management

## Architecture Changes

### Event Structure

**Current (NIP-2):**

- Kind: 3
- Tags: `["p", "<pubkey>", "<relay-hint>", "<petname>"]`
- One global contact list per user

**New (NIP-51):**

- Kind: 30000 (replaceable parameterized event)
- Tags:
  - `["d", "nostube-follows"]` - identifier
  - `["title", "Nostube Follows"]` - optional display name
  - `["p", "<pubkey>"]` - followed pubkeys
- Multiple follow sets possible (future)

### Data Flow

**Reading Follows:**

1. Query kind 30000 with filter: `{ kinds: [30000], authors: [userPubkey], "#d": ["nostube-follows"] }`
2. Use `createAddressLoader` with `{ kind: 30000, pubkey: userPubkey, identifier: "nostube-follows" }`
3. Extract pubkeys from all `p` tags

**Writing Follows:**

1. Get current kind 30000 event from EventStore
2. Add/remove `p` tags as needed
3. Publish updated kind 30000 event to write relays
4. Add to EventStore for immediate UI update

**Migration/Import:**

1. Check if user has kind 30000 with `d=nostube-follows`
2. If not, check for kind 3 contact list
3. If kind 3 exists, show import dialog
4. Copy all `p` tags from kind 3 to new kind 30000

## User Experience

### Follow Import Onboarding Dialog

**Trigger Conditions:**

- User has kind 3 contact list with `p` tags
- User does NOT have kind 30000 with `d=nostube-follows`
- localStorage flag `nostube_onboarding_follow_import` is not set

**Dialog Behavior:**

- Modal dialog with backdrop
- **Non-dismissable** (no X button, must choose action)
- Part of future multi-step onboarding sequence

**Content:**

- **Title**: "Import Your Follows"
- **Message**: "Import your Nostr follow list as Nostube subscriptions to see videos from creators you follow."
- **Count**: Shows number of follows to import (e.g., "47 follows ready to import")
- **Actions**:
  - **"Import Follows"** (primary) - imports all follows
  - **"Skip for Now"** (secondary) - starts with empty subscriptions

**Flow:**

1. User clicks "Import Follows"
2. Loading spinner shows
3. Kind 30000 event published with all `p` tags from kind 3
4. Success message displays
5. Dialog auto-closes after 1-2 seconds
6. localStorage flag set to prevent re-showing

### Existing Follow/Unfollow

- No UI changes to FollowButton
- Same instant feedback behavior
- Uses kind 30000 instead of kind 3 behind the scenes

## Implementation Plan

### Phase 1: Core Hook

**File:** `src/hooks/useFollowSet.ts`

Create new hook to manage kind 30000 follow sets:

```typescript
interface UseFollowSetReturn {
  followedPubkeys: string[]
  isLoading: boolean
  addFollow: (pubkey: string) => Promise<void>
  removeFollow: (pubkey: string) => Promise<void>
  importFromKind3: () => Promise<void>
}

function useFollowSet(identifier: string = 'nostube-follows'): UseFollowSetReturn
```

**Key responsibilities:**

- Load kind 30000 event using `createAddressLoader`
- Parse `p` tags to extract followed pubkeys
- Publish updated events when follows change
- Handle import from kind 3

### Phase 2: Update Existing Hooks

**File:** `src/hooks/useFollowedAuthors.ts`

- Refactor to use `useFollowSet` instead of `ContactsModel`
- Remove kind 3 queries
- Keep same return signature for backward compatibility:
  ```typescript
  return {
    data: followedPubkeys, // now from kind 30000
    isLoading,
    enabled: !!user?.pubkey,
  }
  ```

### Phase 3: Update FollowButton

**File:** `src/components/FollowButton.tsx`

- Replace direct kind 3 event manipulation
- Use `useFollowSet` hook
- Call `addFollow(pubkey)` or `removeFollow(pubkey)`
- Remove manual EventStore manipulation
- Keep same UI/UX

### Phase 4: Import Dialog

**File:** `src/components/FollowImportDialog.tsx`

New component with:

- Conditional rendering based on:
  - Kind 3 existence
  - Kind 30000 non-existence
  - localStorage flag
- Non-dismissable dialog
- Import button calls `useFollowSet.importFromKind3()`
- Skip button sets localStorage flag
- Loading/success states

### Phase 5: Integration

**Files:** `src/App.tsx` or layout component

- Add `<FollowImportDialog />` at top level
- Dialog manages its own visibility

### Phase 6: i18n

**Files:** `src/i18n/locales/{en,de,fr,es}.json`

Add translations for:

- Dialog title
- Dialog message
- Import button text
- Skip button text
- Loading states
- Success/error messages
- Follow count text

## Future Enhancements

1. **Video-creator filtering**: Only import pubkeys that have published video events
2. **Multiple follow sets**: Allow users to create categorized follow sets
3. **Follow set switching**: UI to toggle between different follow sets
4. **Follow set management**: Settings page to view/edit all follow sets

## Technical Considerations

### Backward Compatibility

- No reading from kind 3 after migration
- Users who skip import start with empty follows
- Old kind 3 data remains untouched (other apps can still use it)

### Performance

- Kind 30000 queries are similar cost to kind 3
- Single replaceable event per identifier
- EventStore caching works the same way

### Relay Strategy

- Query from read relays + METADATA_RELAY (same as current)
- Publish to write relays (same as current)

### Error Handling

- Import failures show error message, allow retry
- Network issues during follow/unfollow show feedback
- Missing events handled gracefully (empty follow list)

## Testing Strategy

1. **Unit tests** for `useFollowSet` hook
2. **Integration tests** for FollowButton with kind 30000
3. **Manual testing**:
   - New user with no follows
   - Existing user with kind 3 follows
   - Import flow (accept and skip)
   - Follow/unfollow actions
   - Subscriptions page loading

## Success Criteria

- [ ] Users with kind 3 sees import dialog on first login
- [ ] Import correctly copies all pubkeys to kind 30000
- [ ] Skip creates empty kind 30000 follow set
- [ ] FollowButton adds/removes follows to/from kind 30000
- [ ] SubscriptionsPage shows videos from kind 30000 follows
- [ ] No kind 3 queries in codebase
- [ ] All four languages supported (EN/DE/FR/ES)
- [ ] Build passes without errors
