# Nostube Refactoring Plan

**Last Updated**: 2025-11-04
**Status**: Active Planning

## Executive Summary

This document outlines refactoring priorities for the Nostube codebase following the Nostrify → Applesauce migration. The plan addresses critical architectural issues, code quality improvements, and long-term maintainability goals.

**Critical Issues**: 2 (singleton violations, memory leaks)
**High Priority**: 5 (subscription cleanup, cache logic, performance)
**Medium Priority**: 8 (code organization, type safety, testing)
**Low Priority**: 6 (cleanup, optimization, documentation)

---

## 🔴 CRITICAL (P0) - Fix Immediately

### 1. RelayPool Singleton Violation

**Location**: `src/components/AppProvider.tsx:22-23`

**Issue**: New `RelayPool` instance created on every AppProvider render, violating Applesauce's singleton pattern.

**Impact**:

- Duplicate relay connections
- Memory leaks
- Broken subscription management
- Severe performance degradation

**Fix**:

```typescript
// ❌ CURRENT (BROKEN)
const pool = new RelayPool()
pool.group(config.relays.map(r => r.url))

// ✅ RECOMMENDED
import { relayPool } from '@/nostr/core'

useEffect(() => {
  relayPool.clear()
  relayPool.group(config.relays.map(r => r.url))
}, [config.relays])
```

**Estimated Effort**: 2 hours
**Complexity**: Medium

---

### 2. EventStore Duplication in Tests

**Location**: `src/test/TestApp.tsx:14`

**Issue**: Test environment creates separate EventStore instead of using singleton.

**Impact**:

- Tests don't reflect production behavior
- Cache persistence breaks in tests
- False test results

**Fix**:

```typescript
// ❌ CURRENT
const eventStore = new EventStore()

// ✅ RECOMMENDED
import { eventStore } from '@/nostr/core'
```

**Estimated Effort**: 1 hour
**Complexity**: Low

---

## 🟠 HIGH PRIORITY (P1) - Fix This Sprint

### 3. Memory Leaks from Missing Subscription Cleanup

**Locations**:

- `src/contexts/VideoTimelineContext.tsx:76-83, 98-114`
- `src/components/VideoComments.tsx:136-150`
- `src/nostr/useInfiniteTimeline.ts:23-28`

**Issue**: Observable subscriptions created without cleanup.

**Impact**:

- Memory grows over time
- Subscriptions continue after unmount
- App becomes sluggish

**Fix Pattern**:

```typescript
// ❌ BROKEN
videos$.subscribe(events => {
  setTimelineState(prev => ({ ...prev, videos: events }))
})

// ✅ CORRECT
useEffect(() => {
  const sub = videos$.subscribe(events => {
    setTimelineState(prev => ({ ...prev, videos: events }))
  })
  return () => sub.unsubscribe()
}, [videos$])
```

**Action Items**:

- [ ] Fix VideoTimelineContext subscriptions
- [ ] Fix VideoComments loader subscriptions
- [ ] Fix useInfiniteTimeline cleanup
- [ ] Add subscription cleanup helper hook
- [ ] Add ESLint rule to catch missing cleanup

**Estimated Effort**: 8 hours
**Complexity**: Medium

---

### 4. Inverted Cache Logic

**Location**: `src/hooks/useVideoTimeline.ts:72`

**Issue**: Cache check condition is backwards - loads when it shouldn't, skips when it should.

**Impact**:

- Excessive relay requests (DoS-like behavior)
- Cache system completely ineffective
- Poor performance and wasted bandwidth

**Fix**:

```typescript
// ❌ CURRENT (INVERTED)
if (lastLoaded == undefined || Date.now() - lastLoaded < 60000) {
  // Loads when cache is FRESH (within 60s) - WRONG!

// ✅ CORRECT
if (lastLoaded === undefined || Date.now() - lastLoaded > 60000) {
  // Loads only when cache is STALE (older than 60s)
```

**Estimated Effort**: 1 hour
**Complexity**: Low
**Impact**: High (affects all users)

---

### 5. Incorrect useObservableMemo Dependencies

**Location**: `src/hooks/useVideoTimeline.ts:65-67`

**Issue**: Empty dependency array prevents observable updates.

**Impact**:

- Stale data shown to users
- App appears frozen or stuck

**Fix**:

```typescript
// ❌ CURRENT
const videos = useObservableMemo(() => videos$, []) || []

// ✅ CORRECT
const videos = useObservableMemo(() => videos$, [videos$]) || []
```

**Estimated Effort**: 2 hours (find all instances)
**Complexity**: Low

---

### 6. Remove Console.log Statements

**Locations**: Throughout codebase

- `src/contexts/VideoTimelineContext.tsx`
- `src/hooks/useFollowedAuthors.ts`
- `src/hooks/useBatchedProfiles.ts`
- Many others

**Issue**: Debug console.log left in production code.

**Fix**:

```typescript
// ❌ Remove entirely
console.log('Debug info:', data)

// ✅ Or gate behind dev flag
if (import.meta.env.DEV) console.log('Debug info:', data)
```

**Action Items**:

- [ ] Search codebase for all console.log
- [ ] Remove or gate behind DEV flag
- [ ] Consider adding proper logging library
- [ ] Add ESLint rule: `no-console: ['error', { allow: ['warn', 'error'] }]`

**Estimated Effort**: 3 hours
**Complexity**: Low

---

### 7. Standardize Loader Patterns

**Locations**: Multiple files with inconsistent patterns

**Issue**: Loader usage varies across codebase - some cache-first, some live-only, inconsistent error handling.

**Impact**:

- Hard to maintain
- Performance varies unpredictably
- Bugs hard to track down

**Action Items**:

- [ ] Document standard loader patterns
- [ ] Create typed loader factory functions
- [ ] Create custom hooks wrapping common patterns
- [ ] Refactor all loaders to use standard pattern
- [ ] Fix typo: `evnet` → `event` in useInfiniteTimeline

**Estimated Effort**: 12 hours
**Complexity**: Medium-High

---

## 🟡 MEDIUM PRIORITY (P2) - Fix Next Sprint

### 8. Component Size and Complexity

**Action Items**:

- [ ] Analyze components >300 lines
- [ ] Extract subcomponents from large files
- [ ] Break down complex useEffect chains
- [ ] Create custom hooks for repeated logic

**Targets** (to be identified):

- VideoPage (likely candidate)
- VideoTimelineContext (already complex)
- Any component with >5 useEffect hooks

**Estimated Effort**: 16 hours
**Complexity**: Medium

---

### 9. Type Safety Improvements

**Current Issues**:

- Loose typing around loaders
- Missing null checks in places
- `any` types in some locations

**Action Items**:

- [ ] Enable `strictNullChecks` in tsconfig
- [ ] Add proper types for all loader functions
- [ ] Type the global `__requestProfile` function
- [ ] Replace `any` with proper types
- [ ] Consider branded types for pubkeys/event IDs

**Example**:

```typescript
// Create branded types
type Pubkey = string & { __brand: 'Pubkey' }
type EventId = string & { __brand: 'EventId' }

// Use throughout codebase for type safety
```

**Estimated Effort**: 16 hours
**Complexity**: Medium-High

---

### 10. Cache Strategy Improvements

**Action Items**:

- [ ] Fix inverted cache check (P1 item)
- [ ] Add cache expiration policies per data type
- [ ] Create cache invalidation API
- [ ] Document when to cache vs load fresh
- [ ] Add cache metrics/monitoring
- [ ] Implement cache warming for critical data

**Estimated Effort**: 12 hours
**Complexity**: Medium

---

### 11. Dead Code Removal

**Locations**:

- `src/nostr/core.ts:60-63` - `updateRelayPool` function does nothing
- `useRelaySync` hook calls the no-op function
- Check for unused components/utilities

**Action Items**:

- [ ] Remove `updateRelayPool` function
- [ ] Remove `useRelaySync` hook
- [ ] Run unused exports analysis
- [ ] Remove deprecated Nostrify references
- [ ] Clean up commented-out code

**Estimated Effort**: 4 hours
**Complexity**: Low

---

### 12. Performance Optimization

**Action Items**:

- [ ] Check EventStore lookups before relay requests
- [ ] Use `hasReplaceable()` in useFollowedAuthors
- [ ] Add React.memo to frequently rendered components
- [ ] Implement virtualization for long lists
- [ ] Optimize re-render patterns
- [ ] Bundle size analysis and code splitting

**Example**:

```typescript
// ❌ CURRENT - Always loads from relay
if (contacts && contacts.length === 0 && user?.pubkey) {
  loader({...}).subscribe(e => eventStore.add(e))
}

// ✅ OPTIMIZED - Check cache first
if (user?.pubkey && !eventStore.hasReplaceable(kinds.Contacts, user.pubkey)) {
  loader({...}).subscribe(e => eventStore.add(e))
}
```

**Estimated Effort**: 12 hours
**Complexity**: Medium

---

### 13. Error Handling Standardization

**Action Items**:

- [ ] Create error boundary components
- [ ] Standardize error handling patterns
- [ ] Add user-friendly error messages
- [ ] Implement retry logic for failed requests
- [ ] Log errors for debugging

**Estimated Effort**: 8 hours
**Complexity**: Medium

---

### 14. Testing Coverage

**Action Items**:

- [ ] Fix TestApp to use singleton EventStore (P0)
- [ ] Add tests for critical user flows
- [ ] Test subscription cleanup
- [ ] Test cache behavior
- [ ] Add integration tests for Nostr operations
- [ ] Set up CI/CD testing

**Targets**:

- Auth flows
- Video loading and playback
- Comment posting
- Profile loading
- Relay switching

**Estimated Effort**: 20 hours
**Complexity**: Medium-High

---

### 15. Accessibility Improvements

**Action Items**:

- [ ] Audit keyboard navigation
- [ ] Add ARIA labels where missing
- [ ] Test with screen readers
- [ ] Improve focus management
- [ ] Add skip links

**Estimated Effort**: 8 hours
**Complexity**: Medium

---

## 🟢 LOW PRIORITY (P3) - Future Improvements

### 16. Component Library Organization

**Action Items**:

- [ ] Organize shadcn/ui components consistently
- [ ] Create component documentation
- [ ] Add Storybook for component development
- [ ] Standardize component prop patterns

**Estimated Effort**: 12 hours
**Complexity**: Low-Medium

---

### 17. Custom Hook Organization

**Action Items**:

- [ ] Group related hooks
- [ ] Create hook composition patterns
- [ ] Document hook dependencies
- [ ] Add JSDoc comments

**Estimated Effort**: 6 hours
**Complexity**: Low

---

### 18. CSS and Styling Cleanup

**Action Items**:

- [ ] Audit duplicate Tailwind classes
- [ ] Extract common patterns to CSS utilities
- [ ] Standardize spacing/sizing scales
- [ ] Review responsive breakpoints
- [ ] Consider CSS-in-JS migration if needed

**Estimated Effort**: 8 hours
**Complexity**: Low

---

### 19. Bundle Optimization

**Action Items**:

- [ ] Analyze bundle with `vite-bundle-visualizer`
- [ ] Implement code splitting by route
- [ ] Lazy load heavy components
- [ ] Optimize images and assets
- [ ] Tree shake unused dependencies

**Estimated Effort**: 8 hours
**Complexity**: Medium

---

### 20. Documentation Updates

**Action Items**:

- [ ] Update CLAUDE.md with latest patterns
- [ ] Document Applesauce usage patterns
- [ ] Create architecture decision records
- [ ] Add code review checklist
- [ ] Document deployment process

**Estimated Effort**: 6 hours
**Complexity**: Low

---

### 21. Developer Experience

**Action Items**:

- [ ] Add pre-commit hooks (Husky)
- [ ] Improve ESLint configuration
- [ ] Add commit message linting
- [ ] Create development setup guide
- [ ] Add debugging utilities

**Estimated Effort**: 6 hours
**Complexity**: Low

---

## 🏗️ Architectural Improvements

### A. Centralized Relay Management

**Recommendation**: Single source of truth for relay configuration.

```typescript
// src/nostr/core.ts
export function configureRelays(urls: string[]) {
  relayPool.clear()
  relayPool.group(urls)
}

// Usage throughout app
import { configureRelays } from '@/nostr/core'
```

**Estimated Effort**: 4 hours

---

### B. Subscription Management Helper

**Recommendation**: Create reusable subscription cleanup hook.

```typescript
// src/hooks/useSubscription.ts
function useSubscription<T>(observable: Observable<T>, callback: (value: T) => void, deps: any[]) {
  useEffect(() => {
    const sub = observable.subscribe(callback)
    return () => sub.unsubscribe()
  }, deps)
}
```

**Estimated Effort**: 3 hours

---

### C. Typed Loader Factory

**Recommendation**: Type-safe loader creation.

```typescript
// src/nostr/loaders.ts
export type LoaderConfig = {
  cache?: boolean
  timeout?: number
  relays?: string[]
}

export function createTypedTimelineLoader<T>(config: LoaderConfig): TimelineLoader<T> {
  // Implementation
}
```

**Estimated Effort**: 6 hours

---

### D. Cache Expiration Strategy

**Recommendation**: Configurable cache policies per data type.

```typescript
// src/nostr/cache-config.ts
export const CACHE_POLICIES = {
  videos: { ttl: 60000, strategy: 'stale-while-revalidate' },
  profiles: { ttl: 300000, strategy: 'cache-first' },
  comments: { ttl: 30000, strategy: 'network-first' },
} as const
```

**Estimated Effort**: 8 hours

---

## 📊 Priority Matrix

```
Impact vs Effort

High Impact │ P0-1  P0-2  P1-4
            │ P1-3  P1-6
            │       P1-7  P2-12
            │
Low Impact  │ P2-11 P2-13 P2-14
            │ P3-16 P3-17 P3-18
            │ P3-19 P3-20 P3-21
            │
            └─────────────────────
              Low Effort  High Effort

P0 = Critical
P1 = High
P2 = Medium
P3 = Low
```

---

## 🗓️ Suggested Timeline

### Week 1: Critical Fixes

- [ ] P0-1: RelayPool singleton
- [ ] P0-2: EventStore in tests
- [ ] P1-4: Inverted cache logic
- [ ] P1-5: Observable dependencies

**Goal**: Eliminate critical bugs and memory leaks

---

### Week 2-3: High Priority

- [ ] P1-3: Subscription cleanup (all locations)
- [ ] P1-6: Remove console.log
- [ ] P1-7: Standardize loader patterns

**Goal**: Stabilize core functionality and patterns

---

### Week 4-5: Medium Priority

- [ ] P2-8: Component refactoring
- [ ] P2-9: Type safety improvements
- [ ] P2-12: Performance optimization
- [ ] P2-14: Testing coverage

**Goal**: Improve code quality and maintainability

---

### Week 6+: Low Priority & Polish

- [ ] P3 items as time permits
- [ ] Architecture improvements
- [ ] Documentation updates

**Goal**: Long-term sustainability

---

## 🎯 Success Metrics

Track these before/after refactoring:

### Performance

- [ ] Memory usage stable over 30-minute session
- [ ] Relay request count reduced by 80%
- [ ] Initial page load <2s
- [ ] No subscription leaks (DevTools check)

### Code Quality

- [ ] TypeScript strict mode enabled
- [ ] Zero ESLint errors
- [ ] Test coverage >60%
- [ ] No console.log in production

### Developer Experience

- [ ] Build time <30s
- [ ] All tests pass in CI
- [ ] Clear contribution guidelines
- [ ] Documented patterns

---

## 📚 References

### Applesauce Documentation

- [Official Docs](https://hzrd149.github.io/applesauce/)
- [React Hooks](https://hzrd149.github.io/applesauce/react/hooks.html)
- [Best Practices](https://hzrd149.github.io/applesauce/tutorial/04-relays.html)

### Internal Docs

- `CLAUDE.md` - Project overview
- `TODO.md` - Detailed issue analysis
- `AGENTS.md` - Repository guidelines

---

## ✅ Completion Checklist

### Phase 1: Critical (Week 1)

- [ ] RelayPool singleton implemented
- [ ] EventStore singleton in tests
- [ ] Cache logic fixed
- [ ] All tests passing
- [ ] Memory leak tests added

### Phase 2: Stability (Week 2-3)

- [ ] All subscriptions cleaned up
- [ ] Loader patterns standardized
- [ ] console.log removed
- [ ] Performance baseline established

### Phase 3: Quality (Week 4-5)

- [ ] Components refactored
- [ ] Type safety improved
- [ ] Test coverage added
- [ ] Performance optimized

### Phase 4: Polish (Week 6+)

- [ ] Documentation complete
- [ ] ESLint rules finalized
- [ ] Architecture documented
- [ ] Team onboarded

---

**Next Review**: After Phase 1 completion
**Owner**: Development Team
**Status**: Ready for implementation
