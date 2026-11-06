# Relay browsing: existing flow, gaps and NIP-51 integration

Date: 2026-11-06. Initial analysis followed by the implementation described below; no GitHub issue changes.

## Existing behavior

- Issue [#21](https://github.com/flox1an/nostube/issues/21) proposes relay browsing; the maintainer wants a combination of DVM discovery, subscriptions and relay browsing, not necessarily removal of the default feed.
- `apps/web/src/components/CategoryButtonBar.tsx:60-114,195-250` offers configured read relays, a Global option and an add action that only appears after entering a URL. Adding immediately persists a read relay into general `config.relays` and selects it for browsing.
- `apps/web/src/components/AppProvider.tsx:92,158-169` keeps the active browse override as an in-memory single URL. Reload loses the selection; no shareable browse URL exists.
- Home, Shorts and Category use the override. Home uses `skipCache` and `directMode` to keep unrelated cached events out of the selected-source timeline (`apps/web/src/pages/HomePage.tsx:73-113`). Existing trust filtering still applies.
- The lower timeline loader already accepts multiple relays, with per-relay pagination (`packages/core/src/client.ts:416-500`). No separate feed engine is needed for sets.
- Home also renders Continue watching and subscriptions shelves (`apps/web/src/pages/HomePage.tsx:153-162`); a source selector must not imply that these independent shelves were relay-filtered.
- `useDvmTracker` and `UploadManagerProvider` also use the browse override for DVM tracking. Expanding the override to a set needs an explicit scope decision, not an accidental widening of tracking traffic.
- Standalone `components/RelaySelector.tsx` has no imports found in the current source and is not the visible browse control. Avoid extending this obsolete path.

## Runtime evidence

A throwaway managed Chromium profile ran the local Vite app at desktop width. Global initially listed one configured relay. Typing `relay.damus.io` exposed Add custom relay; choosing it selected `relay.damus.io` and returned video cards. The page URL did not change. Reload returned the source to Global, while the menu now listed two configured relays. These observations confirm the hidden add action, transient selection and general-config side effect. No logged-in signing, real iPhone or production verification was performed.

## Standards and Jumble

Primary specification: [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md).

| Kind | Meaning | Proposed use |
| --- | --- | --- |
| 10002 | NIP-65 account read/write relay list | Keep distinct from browsing; never modify as a side effect of selecting/importing a source. |
| 10012 | Relay feeds: favourite browse relays and references to sets | Read public `relay` tags and `a` references to kind 30002. |
| 30002 | Addressable relay sets; multiple sets per author, identified by `d` | Read public `relay` tags, `title` with `d` fallback, and preserve author/address identity. |

Public entries are tags; private entries can be encrypted in content. The initial integration reads public entries only, requires no decryption/signing and must not call an empty public part a definitively empty set. Sharing an addressable set uses [NIP-19 naddr](https://github.com/nostr-protocol/nips/blob/master/19.md), optionally the [NIP-21 nostr: URI](https://github.com/nostr-protocol/nips/blob/master/21.md) wrapper. Decode and check kind 30002 before using it.

Jumble examined at commit `c53ee5091d43f16de023e03322c65d9f2278a677`:

- [FavoriteRelaysProvider](https://github.com/CodyTseng/jumble/blob/c53ee5091d43f16de023e03322c65d9f2278a677/src/providers/FavoriteRelaysProvider.tsx) reads 10012 and own 30002 sets, caches sets, and writes list/set events. It currently filters out references to sets by other authors, with a TODO to support them. This is evidence about that implementation, not a limitation of NIP-51.
- [event-metadata.ts](https://github.com/CodyTseng/jumble/blob/c53ee5091d43f16de023e03322c65d9f2278a677/src/lib/event-metadata.ts) parses `d`, `title` and normalized `relay` tags.
- [draft-event.ts](https://github.com/CodyTseng/jumble/blob/c53ee5091d43f16de023e03322c65d9f2278a677/src/lib/draft-event.ts) constructs 30002 and 10012 events. Existing encrypted content is retained when publishing; this is essential if editing is added later.

## Recommended scope and order

### 1. Explicit, isolated browsing

- Keep the current source control; always offer an explicit Add relay action, not only a search-dependent command.
- Open a focused URL-entry task: accept a bare hostname or supported WebSocket URL, show the normalized target, validate scheme/host and deduplicate. Do not mistake `new URL()` success for relay validity.
- Browse immediately without saving into general read/write configuration. Optional local favourites/recent sources are separate from account routing and require no signer.
- Support one or multiple relay URLs in the existing override mechanism, while retaining source metadata (single relay versus referenced set, title and author). A bare URL array alone loses set identity and update/share behavior.
- Make the browse source reproducible in URL/history for reload, Back and sharing. Keep the Home/Shorts/Category scope explicit; search, account routing, subscriptions and DVM tracking must not silently inherit it.

### 2. Read existing NIP-51 sources

- For the signed-in user, discover public 10012 entries and own 30002 sets with the existing event store, account/lookup relay infrastructure and address loaders.
- Resolve 10012 references to other authors' sets, not only one's own sets.
- Accept pasted `naddr` / `nostr:naddr` pointing to kind 30002, including for anonymous visitors; offer a preview and explicit Open action before connecting to the set's members.
- Keep the latest valid event per author and `d`, normalize/deduplicate members and retain the set address. A later set revision should not silently reset an in-progress feed; show an available-update action.
- Distinguish unavailable set, no publicly readable members, invalid members and unavailable individual relays. Do not silently fall back to Global.
- Start with one active set at a time, not a set-combination editor. No set creation, remote favourites writes, encrypted entries or signer prompts in this increment.

### 3. Explain source and results

- Show selected source name and relay count, with member details on demand.
- Distinguish connecting, failed, authentication/payment required when known, no matching video events and videos hidden by existing filters. Do not infer a cause from an empty list alone.
- Keep trust/report/NSFW policies unchanged. Relay selection is not a trust endorsement; coordinate with #108 without reopening that research.
- Isolate direct-source timelines from unrelated cached feed results; merge/deduplicate across members and cancel/reset old pagination on explicit source changes.
- Bound parallel connections and paginated requests for large imported sets. Surface size and partial failures; do not silently truncate a set or open arbitrary numbers of connections.
- Validate relay URLs and hints, respect HTTPS mixed-content constraints and instance relay policy. Importing an untrusted set must not automatically connect to its members; browsers have privacy/network implications even without publishing.

## UI direction

All new UI must use [apple-design-skill](https://github.com/dickwu/apple-design-skill), including its cross-platform translation, accessibility, layout, typography, color, entering-data, feedback and popover guidance.

Reuse Nostube's current tokens, primitives and icons. Keep quick selection small: default feed, recent/favourite relays, available sets, Add relay, Open relay set. Use a focused dialog or mobile sheet for entry/preview rather than turning the popover into a management screen. Show persistent field labels, inline errors, keyboard/focus support, readable long URLs and text status in addition to color. A management surface can follow when users need to edit many sources.

## Later, only if needed

Create/edit/publish 30002 sets; update 10012 favourites; private-entry decryption; social relay recommendations; rich NIP-11 relay information and discovery. These are separate from consuming existing public sets. Any future writer must fetch the latest event, preserve unknown tags/encrypted content and avoid overwriting changes from other clients.

## Acceptance scenarios for implementation

1. Anonymous visitor explicitly adds a valid relay; only browse state changes, not account/app routing. Reload and Back restore the source.
2. Existing Jumble-authored public set appears for its owner and loads the same normalized members without signing.
3. A shared kind-30002 naddr opens after preview; wrong-kind addresses and malformed URLs show actionable errors.
4. Multi-relay results deduplicate and paginate; one failed member does not hide successful members or trigger Global fallback.
5. Empty, private-only/unreadable and unavailable sets are distinguishable; filtered content does not cause a false relay-down message.
6. Switching sources cancels old feed work; unrelated cached videos do not leak into direct-source results; independent shelves are labelled or separated.
7. Existing trust policy and account read/write relays remain unchanged. Real narrow-mobile and keyboard/screen-reader flows receive acceptance checks.

## Settings interoperability and client comparison

Nostube's active editor is `NetworkSettingsSection.RelaysSubSection`, not the standalone `RelaySettingsSection`. It edits browser-local `config.relays`; `useReadRelays` reads this configuration. `UserRelaySync` merges missing NIP-65 relays into it but neither removes old entries nor publishes edits. This distinction is now explained in Settings. Browsing and local saved sources use separate state and never update this configuration.

- **Jumble:** opening a relay only registers a temporary active source; favourites publish 10012, sets publish 30002, and the Mailbox settings explicitly save 10002. [FavoriteRelaysProvider](https://github.com/CodyTseng/jumble/blob/c53ee5091d43f16de023e03322c65d9f2278a677/src/providers/FavoriteRelaysProvider.tsx).
- **Coracle:** Explore is temporary; Join changes NIP-65 read/write policy and can rebroadcast profile/follow metadata. We do not copy that coupling. [commands](https://github.com/coracle-social/coracle/blob/81581be7d1dec59e274dea2d65096ad5774c7eab/src/engine/commands.ts#L268-L340).
- **noStrudel:** relay-feed favourites use 10012, while account inbox/outbox live on a separate Mailboxes screen; local fallback/lookup relays are another concern. [relay feed](https://github.com/hzrd149/nostrudel/blob/339095566f0feb384fefc98518662fa45b8ab604/src/views/feeds/relays/relay-feed.tsx), [Mailboxes](https://github.com/hzrd149/nostrudel/blob/339095566f0feb384fefc98518662fa45b8ab604/src/views/settings/mailboxes/index.tsx).

Comparisons are source inspections, not runtime verification of those apps.

## Implemented behavior and evidence

- Reused the existing direct timeline loader for single and multi-relay sources; source identity and lookup hints survive sharing, while identity comparisons ignore hint differences.
- Explicit relay and public-set entry/preview, URL/history persistence, and per-account browser-local saved sources shared with Network settings. Signed-in public 10012 relays and references (including other authors) and own 30002 sets are read without signing or decryption.
- Shared-set links only use configured discovery relays for passive metadata lookup. Explicit Preview may contact address hints/the author's outbox. Feed members are contacted after explicit Open. A set exceeding 12 members is rejected rather than silently truncated.
- Existing account read/write configuration, trust settings and DVM tracking remain separate. Home's independent shelves are hidden for a selected browse source.
- Browser smoke used real public relay reads plus isolated local WebSocket relays with signed NIP-51/video events. Verified URL/reload/Back, unchanged app config after browsing, local favourites appearing in Settings, public 10012 favourite and foreign-set reference discovery under a temporary account, preview before member requests, deduplicated multi-relay results and successful video results with one member stopped. Mobile 390px and English/German surfaces inspected. No production deployment or physical iPhone/VoiceOver run.
- Final verification: web typecheck and targeted ESLint pass; the complete web Vitest run passes (91 files, 466 tests, one skipped). Vite web/PWA and embed builds pass. The built web client was exercised at 390px: saved single-relay selection survives reload without changing app config; a shared set performs no member requests before explicit Open; after Open, one available member returns the video while another member is stopped, with no page runtime errors. Production build reports large-chunk and Node-module browser-externalization warnings.

