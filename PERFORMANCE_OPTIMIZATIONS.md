# ShortsVideoPage Performance Optimizations

## Trace Analysis Results (Trace-20251128T191725.json.gz)

### Key Findings:

- **3,277 IntersectionObserver computations** (~34ms total, ~109 calls/second)
- **UpdateLayoutTree events**: Multiple >1ms events (max 4.67ms)
- **Heavy JavaScript execution**: Function calls up to 196ms
- **RunMicrotasks**: 192.74ms consumed by async operations

## Recommended Optimizations

### 1. IntersectionObserver Optimization (HIGH IMPACT)

**Current Issues:**

- Creating new observer on every videoIdsKey change (line 586)
- No throttling/debouncing of intersection callbacks
- All video elements observed simultaneously

**Proposed Changes:**

```typescript
// Add throttling to intersection callback
const observerCallbackRef = useRef<NodeJS.Timeout>()

useEffect(() => {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return
  }

  const observer = new IntersectionObserver(
    entries => {
      // Throttle callback to max 60fps (16.67ms)
      if (observerCallbackRef.current) return

      observerCallbackRef.current = setTimeout(() => {
        observerCallbackRef.current = undefined

        let bestEntry: IntersectionObserverEntry | null = null
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry
          }
        }

        if (!bestEntry) return

        const target = bestEntry.target as HTMLElement
        const indexAttr = target.dataset.index
        if (!indexAttr) return
        const nextIndex = Number(indexAttr)
        if (Number.isNaN(nextIndex)) return

        if (nextIndex !== currentVideoIndexRef.current) {
          currentVideoIndexRef.current = nextIndex
          setCurrentIndex(nextIndex)
        }
      }, 16) // ~60fps
    },
    {
      threshold: [0.5, 0.8], // Reduce thresholds from 4 to 2
      rootMargin: '200px', // Further reduce from 400px
    }
  )

  observerRef.current = observer
  videoElementsRef.current.forEach(element => observer.observe(element))

  return () => {
    if (observerCallbackRef.current) {
      clearTimeout(observerCallbackRef.current)
    }
    observer.disconnect()
    observerRef.current = null
  }
}, [setCurrentIndex, videoIdsKey])
```

**Expected Impact:** Reduce IntersectionObserver calls by ~70% (from ~109/s to ~30/s)

### 2. Memoize Expensive Computations (MEDIUM IMPACT)

**Current Issues:**

- `reactionRelays` computed on every render (line 175-178)
- `authorNprofile` recreated unnecessarily (line 145-148)
- Multiple `useMemo` hooks could be optimized

**Proposed Changes:**

```typescript
// In ShortVideoItem component

// Memoize relay combinations with stable references
const eventRelays = useMemo(() => {
  if (!event) return []
  const seenRelays = getSeenRelays(event)
  return seenRelays ? Array.from(seenRelays) : []
}, [event])

const pointerRelays = useMemo(() => {
  if (!video.link) return []
  try {
    const identifier = decodeVideoEventIdentifier(video.link)
    if (!identifier) return []
    const relays =
      identifier.type === 'event'
        ? identifier.data?.relays
        : identifier.type === 'address'
          ? identifier.data?.relays
          : undefined
    return relays ? [...relays] : []
  } catch {
    return []
  }
}, [video.link])

// Memoize preset relay URLs at module level to avoid recreation
const PRESET_RELAY_URLS = presetRelays.map(relay => relay.url)

const reactionRelays = useMemo(
  () => combineRelays([eventRelays, pointerRelays, userReadRelays, PRESET_RELAY_URLS]),
  [eventRelays, pointerRelays, userReadRelays]
)
```

**Expected Impact:** Reduce unnecessary array allocations and function calls

### 3. Optimize Video Preloading Strategy (MEDIUM IMPACT)

**Current Issues:**

- Preloading window is fixed (current +/- certain videos)
- Could be smarter based on scroll direction and velocity

**Proposed Changes:**

```typescript
// Track scroll direction for smarter preloading
const scrollDirectionRef = useRef<'up' | 'down'>('down')
const lastScrollIndexRef = useRef(0)

useEffect(() => {
  if (currentVideoIndex > lastScrollIndexRef.current) {
    scrollDirectionRef.current = 'down'
  } else if (currentVideoIndex < lastScrollIndexRef.current) {
    scrollDirectionRef.current = 'up'
  }
  lastScrollIndexRef.current = currentVideoIndex
}, [currentVideoIndex])

// In render loop
const shouldPreload =
  index === currentVideoIndex || // Current (always)
  (scrollDirectionRef.current === 'down' && index === currentVideoIndex + 1) || // Next if scrolling down
  (scrollDirectionRef.current === 'down' && index === currentVideoIndex + 2) || // Next+1 if scrolling down
  (scrollDirectionRef.current === 'up' && index === currentVideoIndex - 1) // Previous if scrolling up
```

**Expected Impact:** Reduce unnecessary network requests and memory usage

### 4. Reduce Render Window (LOW-MEDIUM IMPACT)

**Current Issues:**

- Rendering window of ±3 videos (7 total)
- Could be reduced to ±2 (5 total) for mobile

**Proposed Changes:**

```typescript
// Adjust render window based on device
const renderWindow = useMemo(() => {
  if (typeof window === 'undefined') return 3
  return window.innerWidth < 768 ? 2 : 3 // Smaller window on mobile
}, [])

// In render loop (line 919)
const distanceFromCurrent = Math.abs(index - currentVideoIndex)
const shouldRender = distanceFromCurrent <= renderWindow
```

**Expected Impact:** Reduce DOM size and UpdateLayoutTree events by ~28%

### 5. Batch State Updates (LOW IMPACT)

**Current Issues:**

- Multiple state updates in effects could trigger multiple re-renders
- No use of `startTransition` for non-urgent updates

**Proposed Changes:**

```typescript
import { useTransition } from 'react'

const [isPending, startTransition] = useTransition()

// Update URL in transition (line 869-876)
useEffect(() => {
  if (currentVideo && currentVideo.link !== nevent) {
    const newPath = `/short/${currentVideo.link}`
    pendingUrlUpdateRef.current = currentVideo.link

    startTransition(() => {
      navigate(newPath, { replace: true })
    })
  }
}, [currentVideo, nevent, navigate])
```

**Expected Impact:** Reduce layout thrashing during navigation

### 6. Optimize CSS containment (LOW IMPACT)

**Proposed Changes:**
Add CSS containment to video containers to isolate layout calculations:

```tsx
// In ShortVideoItem return (line 324)
<div
  ref={handleRootRef}
  data-video-id={video.id}
  className="snap-center min-h-screen h-screen w-full flex items-center justify-center bg-black"
  style={{
    scrollSnapAlign: 'center',
    scrollSnapStop: 'always',
    contain: 'layout style paint', // Add containment
    contentVisibility: isActive ? 'visible' : 'auto' // Only render visible content
  }}
>
```

**Expected Impact:** Reduce UpdateLayoutTree propagation

## Priority Implementation Order

1. **IntersectionObserver throttling** (lines 545-586) - Highest impact
2. **Memoize relay computations** (lines 151-178) - Medium impact, easy win
3. **CSS containment + contentVisibility** - Low effort, good impact
4. **Reduce render window on mobile** (line 919) - Easy change
5. **Smart preloading based on scroll direction** - Nice to have
6. **Batch state updates with startTransition** - Lower priority

## Expected Overall Impact

- **50-70% reduction** in IntersectionObserver calls
- **20-30% reduction** in UpdateLayoutTree events
- **Faster time-to-interactive** for each video
- **Lower memory usage** from smaller render window
- **Smoother scrolling** from reduced layout thrashing

## Testing Plan

1. Capture new performance trace after each optimization
2. Compare metrics:
   - IntersectionObserver call frequency
   - UpdateLayoutTree event count and duration
   - Time to first video play
   - Scroll frame rate (should be 60fps)
3. Test on both mobile and desktop
4. Verify no regressions in functionality
