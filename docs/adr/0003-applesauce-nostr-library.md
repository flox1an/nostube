# ADR 0003: Use Applesauce as the Nostr Protocol Library

**Date:** 2026-06-05  
**Status:** Accepted

## Context

A Nostr client needs to handle relay connections, event signing, subscription management, event caching, and higher-level protocol types (wallets, content kinds). The minimal option is `nostr-tools` — a low-level library — combined with custom relay pooling and subscription logic. Applesauce is a higher-level library family (`applesauce-core`, `applesauce-relay`, `applesauce-accounts`, `applesauce-signers`, `applesauce-loaders`, `applesauce-react`, `applesauce-wallet`) that provides these layers out of the box.

## Decision

Use Applesauce as the primary Nostr protocol library.

## Rationale

Applesauce provides solid, well-composed abstractions for the full Nostr client stack: relay pooling (`RelayPool`), in-memory event caching (`EventStore`), batched timeline loading (`TimelineLoader`), account and signer management, and wallet/NWC support. Rolling equivalent functionality on top of `nostr-tools` alone would require significant custom code across all of these areas.

The breadth of protocol coverage — particularly wallet support and higher-level content types — was the deciding factor over a thinner library.

## On RxJS

Applesauce exposes data via RxJS Observables. This was accepted as a dependency cost, not sought out as an architectural goal. NosTube does not require real-time streaming in most flows; the Observable model is used because Applesauce requires it, not because reactive streams are the right model for this domain.

**Do not interpret the presence of RxJS as an invitation to add reactive complexity.** Reach for Observables only where Applesauce already provides them; prefer simpler patterns elsewhere.

## Consequences

- The data layer is tightly coupled to Applesauce's API surface; a major version change or abandonment would require significant refactoring.
- RxJS is a transitive dependency throughout the codebase. Keep reactive patterns confined to the data-loading layer.
- Higher-level Nostr features (wallets, loaders, signers) are available without custom implementation.
