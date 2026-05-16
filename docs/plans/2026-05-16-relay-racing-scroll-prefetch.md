# Relay Racing and Scroll Prefetch Plan

## Goal

Make timeline and shorts loading feel instant for users by showing the first useful data quickly, keeping relay work in the background, and prefetching before the user reaches the end of the current list.

This plan covers:

- Proposal 2: relay racing with first useful response.
- Proposal 3: scroll prefetch instead of bottom-triggered loading.

## Current Shape

The main feed path already has a strong foundation:

- `src/nostr/core.ts` builds timeline loaders with per-relay cursors and optional cache loading.
- `src/nostr/useInfiniteTimeline.ts` owns the phase model and converts relay/cache events into processed `VideoEvent`s.
- `src/hooks/useInfiniteScroll.ts` triggers `loadMore` when the bottom sentinel enters view.
- `src/pages/shorts/ShortsVideoPage.tsx` has a separate shorts loading path backed by `src/stores/shortsFeedStore.ts`.

The next improvement is to decouple user-visible readiness from full relay completion. A page should become usable as soon as enough data exists, while slower relays continue filling the EventStore.

## Phase 1: Relay Racing

### Add Relay Performance Tracking

Create a small relay score module:

- New file: `src/nostr/relay-performance.ts`
- Track per-relay:
  - last successful response time
  - timeout count
  - error count
  - events received
  - moving average latency
  - moving average events per second

Use in-memory state first. Persisting to local storage can come later once the scoring feels right.

Suggested API:

```ts
export type RelayPerformanceSnapshot = {
  relay: string
  averageLatencyMs: number | null
  successCount: number
  timeoutCount: number
  errorCount: number
  eventsReceived: number
  score: number
}

export function orderRelaysByPerformance(relays: string[]): string[]
export function markRelayStarted(relay: string, requestId: string): void
export function markRelayFirstEvent(relay: string, requestId: string): void
export function markRelayComplete(relay: string, requestId: string, events: number): void
export function markRelayError(relay: string, requestId: string): void
export function markRelayTimeout(relay: string, requestId: string): void
```

### Prefer Fast Relays in Timeline Loaders

Update `getTimelineLoader` in `src/nostr/core.ts`:

- Sort the incoming relay list with `orderRelaysByPerformance`.
- Keep the per-relay cursor behavior.
- Add lightweight instrumentation around relay results if Applesauce exposes enough event source metadata.
- If direct per-relay instrumentation is not available from `loadBlocksFromFilterMap`, start with ordering only and add deeper metrics in a follow-up loader wrapper.

Acceptance criteria:

- Slow relays no longer define perceived loading speed.
- Relay ordering is stable and deterministic for equal scores.
- Existing `relayOverride` behavior still uses only the selected relay.

### Add First Useful Response Semantics

Update `src/nostr/useInfiniteTimeline.ts`:

- Add options:
  - `minInitialEvents?: number`
  - `minMoreEvents?: number`
  - `firstUsefulTimeoutMs?: number`
  - `backgroundSettleMs?: number`
- Keep the subscription alive after the UI leaves loading state.
- Mark UI as ready when either:
  - at least `minInitialEvents` events are visible, or
  - `firstUsefulTimeoutMs` has elapsed and at least one event exists.
- Continue writing later relay events into EventStore until `backgroundSettleMs` or completion.

Proposed phase split:

```ts
type TimelinePhase =
  | 'idle'
  | 'loading-initial'
  | 'ready'
  | 'refreshing'
  | 'prefetching'
  | 'loading-more'
  | 'exhausted'
  | 'error'
```

Return values should include:

```ts
loading: boolean
isInitialLoading: boolean
isLoadingMore: boolean
isRefreshing: boolean
isPrefetching: boolean
subscriptionActive: boolean
```

Acceptance criteria:

- Initial feed can render after first useful data without waiting for every relay.
- Later relay events still appear reactively.
- Infinite scroll does not retrigger while the background subscription is active.
- Empty state is delayed until relays actually complete or timeout with no events.

## Phase 2: Scroll Prefetch

### Extend Infinite Scroll Triggering

Update `src/hooks/useInfiniteScroll.ts` or add a sibling hook:

- Keep sentinel-based loading for compatibility.
- Add list-position based prefetch support:
  - `itemCount`
  - `visibleEndIndex`
  - `prefetchThresholdRatio`, default `0.7`
  - `onPrefetch`
  - `prefetching`

For grid pages where visible index is not available, keep the IntersectionObserver sentinel but increase lookahead through a separate prefetch sentinel or larger prefetch-only `rootMargin`.

Acceptance criteria:

- Existing `VideoTimelinePage` call sites still work.
- Pages can opt into prefetch without changing visual loading states.
- `onPrefetch` is gated by `loading`, `prefetching`, `exhausted`, and `subscriptionActive`.

### Add Prefetch Entry Point to Timeline Hook

Update `src/nostr/useInfiniteTimeline.ts`:

- Add `prefetchMore`.
- Internally use the same loader path as `loadMore`, but set phase to `prefetching`.
- Do not show bottom loading spinner during prefetch.
- If the user reaches the end while prefetch is active, keep the gate closed and let the prefetch complete.

Return:

```ts
loadMore: () => void
prefetchMore: () => void
```

Acceptance criteria:

- Calling `prefetchMore` appends events to EventStore exactly like `loadMore`.
- Duplicate events are still filtered by EventStore and `processEvents`.
- No visible spinner appears when there are already enough videos on screen.

### Wire Feed Pages

Update:

- `src/components/VideoTimelinePage.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/ShortsPage.tsx`
- `src/pages/AuthorPage.tsx`
- `src/pages/CategoryPage.tsx`
- `src/pages/HashtagPage.tsx`

Pattern:

- Pass `prefetchMore` from `useInfiniteTimeline`.
- Use prefetch for early loading.
- Keep `loadMore` for the bottom fallback.
- Pass `subscriptionActive` to avoid repeated calls while a background subscription is open.

Acceptance criteria:

- Home and Shorts can scroll through at least two pages without visible loading on a normal connection.
- Existing empty and exhausted messages remain correct.
- Relay override still bypasses shared cache and does not leak other relay results into the page.

## Phase 3: Shorts-Specific Buffering

### Replace Boolean Loading with Feed Status

Update `src/stores/shortsFeedStore.ts`:

- Replace `isLoading: boolean` with:

```ts
status: 'idle' | 'initial-loading' | 'ready' | 'prefetching' | 'refreshing' | 'exhausted' | 'error'
```

- Keep a derived compatibility selector or return `isLoading` from components during migration.

Acceptance criteria:

- Shorts page no longer needs multiple `setLoading(false)` calls for success, fallback, and partial data.
- The first video can play while suggestions continue loading.

### Prefetch Around Current Shorts Index

Update `src/pages/shorts/ShortsVideoPage.tsx`:

- Trigger timeline prefetch when `currentVideoIndex >= allVideos.length - 4`.
- Keep rendering placeholders for far videos as today.
- Preload video sources/posters for:
  - current video
  - previous video
  - next two videos
  - one extra video when network is fast

Acceptance criteria:

- Scrolling from one short to the next rarely waits on relay loading.
- Direct URL entry still renders the initial video immediately.
- Author-filtered shorts keep using the store path and do not accidentally fetch unrelated relay suggestions.

## Test Plan

Run:

```bash
npm run typecheck
npm run test -- --run
```

Manual browser checks:

- Home feed first load with default relays.
- Home feed with `relayOverride`.
- Shorts list page.
- Fullscreen shorts video page direct URL.
- Fast scrolling near the end of a feed.
- Offline or slow-relay behavior, confirming old cached/store content remains usable where available.

Instrumentation checks:

- Add temporary dev-only debug logs or a small debug panel for relay scores.
- Confirm the UI leaves initial loading before every relay completes.
- Confirm background relay events still append after the page is already usable.

## Rollout Order

1. Add relay performance module and use it for relay ordering only.
2. Split `useInfiniteTimeline` into visible readiness and background subscription activity.
3. Add `prefetchMore` to the timeline hook.
4. Wire `VideoTimelinePage` and Home/Shorts list pages.
5. Convert fullscreen shorts store from boolean loading to status.
6. Tune thresholds based on real traces.

## Risks

- Ending visible loading early can show too few items if the first relay returns sparse data. Mitigation: require `minInitialEvents` or a short useful-response timeout.
- Background subscriptions can retrigger pagination if not gated. Mitigation: expose and use `subscriptionActive`.
- Relay scoring can accidentally punish niche relays with fewer events. Mitigation: score latency and reliability separately from event volume.
- Prefetch can over-fetch on fast scroll. Mitigation: one in-flight prefetch per feed key and conservative thresholds.
