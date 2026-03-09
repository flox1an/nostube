# Relatr Integration for NosTube Gamification

## What is Relatr?

[Relatr](https://github.com/ContextVM/relatr) is an MIT-licensed TypeScript service by ContextVM that computes **personalized trust scores (0-100)** for Nostr pubkeys by combining:

1. **Social graph distance** — follow-graph proximity via `nostr-social-duck` + DuckDB
2. **NIP-05 verification** — valid `_@domain` identities (weight: 0.15, root NIP-05 bonus: 0.05)
3. **Lightning address** — LUD-16/LUD-06 payment capability (weight: 0.10)
4. **Relay list publication** — kind 10002 relay metadata exists (weight: 0.10)
5. **Reciprocity** — mutual follow relationships (weight: 0.10)
6. **Graph distance** — normalized with decay factor α=0.1 (weight: 0.50)

**Score formula:** `Score = Σ(wᵢ × vᵢ) / Σ(wᵢ)` → clamped to [0, 1], published as 0-100 integer.

It publishes scores as **NIP-85 kind 30382** Trusted Assertion events:

```json
{
  "kind": 30382,
  "tags": [
    ["d", "<target-pubkey>"],
    ["rank", "73"]
  ],
  "content": "",
  "pubkey": "<relatr-service-key>"
}
```

### Architecture

- **Runtime:** Bun + TypeScript (95% TS)
- **Database:** DuckDB (unified persistence + graph analysis)
- **Interface:** MCP server + web config UI
- **Deployment:** Docker Compose, ~256MB RAM minimum
- **Source:** [github.com/ContextVM/relatr](https://github.com/ContextVM/relatr) (MIT)
- **Frontend:** [github.com/ContextVM/relatr-web](https://github.com/ContextVM/relatr-web) (Svelte)

---

## Comparison: Our Gamification Design vs. Relatr

### What Relatr Already Solves

| Our Design Component                    | Current Plan                                             | Relatr Alternative                                                                |
| --------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **WoT Multiplier** (lines 237-248)      | Count followers from Level 3+ users, 5 tiers (0.1x-1.5x) | Use `rank` tag from kind 30382 — already PageRank-weighted, Sybil-resistant       |
| **Sybil Detection** (line 222)          | "NIP-51 Follows as multiplier" (vague)                   | Graph distance + reciprocity + NIP-05 + lightning — multi-signal, proven          |
| **Colluding Ring Detection** (line 226) | "Graph analysis; closed zap circles → reduced value"     | PageRank naturally devalues closed clusters; Relatr's distance decay handles this |
| **WoT Graph in Redis** (line 279)       | Redis cache for WoT graph                                | DuckDB already indexes the social graph; no need to build our own                 |

### What Relatr Does NOT Solve (Oracle Still Needed)

| Component                 | Why We Still Need It                                |
| ------------------------- | --------------------------------------------------- |
| **Point accumulation**    | Relatr scores identity trust, not platform activity |
| **Level progression**     | Activity-based levels are NosTube-specific          |
| **Quest system**          | Daily/weekly/milestone quests are NosTube-specific  |
| **Badge awards** (NIP-58) | Relatr doesn't issue badges                         |
| **Action verification**   | Mirror HEAD checks, upload validation, zap receipts |
| **Moderation hierarchy**  | Report weighting, moderator quiz, consensus         |
| **Rate limiting**         | Per-action limits based on level                    |
| **Streak tracking**       | Consecutive quest completion                        |
| **Leaderboards**          | Aggregated platform rankings                        |

---

## Integration Architecture: Relatr as WoT Backend for Our Oracle

### Option A: Consume Relatr's NIP-85 Events (Recommended)

Our Oracle subscribes to Relatr's kind 30382 events and uses the `rank` tag as the WoT multiplier input. No code changes to Relatr needed.

```
┌──────────────┐     kind 30382      ┌──────────────────────┐
│   RELATR     │────────────────────▶│   NOSTUBE ORACLE     │
│  (separate   │   ["rank", "73"]    │                      │
│   service)   │                     │  WoT Factor = f(rank)│
└──────────────┘                     │  Points = Base × WoT │
       ▲                             │  Levels, Quests, ... │
       │ follows graph               └──────────────────────┘
       │ NIP-05, LN, relays                    │
┌──────┴───────┐                     kind 30079, 30080, 8
│ NOSTR RELAYS │◀────────────────────────────────┘
└──────────────┘
```

**Oracle Event Ingester addition:**

```typescript
// Subscribe to Relatr's trust scores for users we track
const relatrFilter = {
  kinds: [30382],
  authors: [RELATR_SERVICE_PUBKEY],
  '#d': [
    /* tracked user pubkeys */
  ],
}
```

**WoT mapping (replaces lines 237-248 of current design):**

```typescript
function getWotFactor(relatrRank: number): number {
  if (relatrRank <= 10) return 0.1 // Sybil/spam territory
  if (relatrRank <= 25) return 0.5 // Low trust
  if (relatrRank <= 50) return 0.8 // Below average
  if (relatrRank <= 70) return 1.0 // Normal
  if (relatrRank <= 85) return 1.2 // Above average
  return 1.5 // Highly trusted
}

// In Reward Publisher:
const effectivePoints = basePoints * getWotFactor(userRelatrRank)
```

**Advantages:**

- Zero custom graph analysis code
- Sybil resistance out of the box
- Multi-signal trust (not just follower count)
- Scores update automatically as social graph changes
- Relatr runs as a separate service — clean separation of concerns

**Disadvantages:**

- External dependency (but MIT-licensed, can self-host)
- Score computation is global, not NosTube-specific (but that's actually better for Sybil resistance)
- 72h cache TTL means scores aren't real-time (acceptable for WoT multiplier)

### Option B: Fork Relatr, Add Gamification Directly

Fork Relatr and extend it to also compute NosTube gamification scores — essentially merge the Oracle into Relatr.

**Not recommended because:**

- Relatr's architecture is optimized for graph analysis, not action verification
- Mixing concerns (identity trust vs. platform activity) makes both harder to maintain
- Loses upstream updates from ContextVM
- Our Oracle needs PostgreSQL for relational data (quests, streaks, action history); Relatr uses DuckDB

### Option C: Run Relatr as a Sidecar to Our Oracle

Deploy Relatr alongside the Oracle in the same Docker Compose stack. Oracle queries Relatr's MCP API directly instead of subscribing to relay events.

```yaml
# docker-compose.yml
services:
  oracle:
    build: ./oracle
    depends_on: [relatr, postgres, redis]
  relatr:
    image: contextvm/relatr
    environment:
      - TA_ENABLED=false # No need to publish to relays
      - SERVER_SECRET_KEY=${RELATR_KEY}
    volumes:
      - relatr-data:/data
  postgres:
    image: postgres:16
  redis:
    image: redis:7
```

**Oracle queries Relatr via MCP for trust scores on-demand.**

This avoids relay round-trips but couples deployment. Good for self-hosted setups.

---

## Revised Level System Using Relatr

With Relatr handling WoT, we can simplify our level requirements and add a trust-gate:

### Trust-Gated Levels

```
Level Requirements = Activity Points + Relatr Trust Gate
```

| Level | Points | Name        | Relatr Rank Gate | Rationale                                  |
| ----- | ------ | ----------- | ---------------- | ------------------------------------------ |
| 0     | 0      | Newcomer    | None             | Anyone can watch                           |
| 1     | 50     | Viewer      | rank ≥ 5         | Minimal identity signal to comment         |
| 2     | 200    | Contributor | rank ≥ 15        | Some graph presence to upload              |
| 3     | 500    | Creator     | rank ≥ 30        | Established identity for advanced features |
| 4     | 1,500  | Trusted     | rank ≥ 50        | Strong trust for moderation weight         |
| 5     | 5,000  | Veteran     | rank ≥ 65        | High trust for moderator qualification     |
| 6     | 15,000 | Legend      | rank ≥ 75        | Very high trust for special status         |

**Key change:** Instead of "Min. 10 videos uploaded OR 20 mirrors" as extra requirements for Level 4+, we use Relatr's rank as the trust gate. This is:

- Harder to game (can't just upload junk to meet the requirement)
- Based on real social graph analysis, not just platform activity
- Updated automatically as the user's network position changes

### Level-Down on Trust Loss

If a user's Relatr rank drops below their level's gate:

- **Grace period:** 30 days at reduced rank before level-down
- **Notification:** "Your trust score has dropped. Improve your Nostr profile to maintain Level X."
- This handles cases where someone gets unfollowed by key accounts

### Score Update Event (Revised kind 30079)

```json
{
  "kind": 30079,
  "tags": [
    ["d", "<user-pubkey>"],
    ["p", "<user-pubkey>"],
    ["points", "1250"],
    ["level", "4"],
    ["level-name", "Trusted"],
    ["wot-rank", "67"],
    ["wot-factor", "1.0"]
  ],
  "content": ""
}
```

The `wot-rank` tag records the Relatr rank used at calculation time for transparency.

---

## Revised Anti-Gaming With Relatr

### What We Can Remove From Our Design

| Anti-Gaming Measure                   | Status       | Reason                                                                     |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| Build own follow graph indexer        | **REMOVE**   | Relatr does this                                                           |
| Custom PageRank implementation        | **REMOVE**   | Relatr does this                                                           |
| Sybil detection via follower counting | **REMOVE**   | Relatr's multi-signal approach is superior                                 |
| Redis WoT Graph cache                 | **REMOVE**   | Relatr handles graph persistence in DuckDB                                 |
| Graph analysis for colluding rings    | **SIMPLIFY** | Relatr's distance decay handles most cases; keep zap-circle detection only |

### What We Keep

| Anti-Gaming Measure         | Status   | Reason                                  |
| --------------------------- | -------- | --------------------------------------- |
| Rate limits per action type | **KEEP** | Platform-specific, not identity-related |
| Self-mirror block           | **KEEP** | Requires action verification            |
| Min file size for uploads   | **KEEP** | Platform rule                           |
| Zap-washing detection       | **KEEP** | Zap-level analysis, not graph-level     |
| False report penalties      | **KEEP** | Moderation-specific                     |
| Cooling-off periods         | **KEEP** | Platform behavioral rule                |

### New: Relatr-Powered Admission Control

```typescript
async function canEarnPoints(pubkey: string): Promise<{ allowed: boolean; factor: number }> {
  const rank = await getRelatrRank(pubkey)

  if (rank === null) {
    // No Relatr score yet — allow minimal participation
    return { allowed: true, factor: 0.1 }
  }

  if (rank < 5) {
    // Almost certainly Sybil — block point earning entirely
    return { allowed: false, factor: 0 }
  }

  return { allowed: true, factor: getWotFactor(rank) }
}
```

This replaces the entire "Web-of-Trust Multiplier" section (lines 237-248) with a single function backed by Relatr.

---

## Implementation Plan (Revised Phases)

### Phase 1: MVP (4-6 weeks) — No Relatr Yet

Same as current design. Simple points + levels without WoT multiplier.

- Oracle: Event Ingester, Score calculation, Nostr publisher
- Verification: Auto-verifiable actions only
- Points: Simple system, no WoT
- Quests: 3 onboarding, 1 daily, 1 weekly
- Badges: Level badges + Creator, Archivar

### Phase 2: Moderation (3-4 weeks) — No Relatr Yet

Same as current design. Reports, moderator quiz, penalties.

### Phase 3: Trust & Social (3-4 weeks) — Integrate Relatr

**Changed from current design:**

- ~~Build WoT graph analysis~~ → Deploy Relatr instance or subscribe to public instance
- ~~Custom PageRank~~ → Consume kind 30382 events
- ~~Redis WoT cache~~ → Relatr handles this
- Add trust gates to level requirements
- Add WoT multiplier to point calculation using Relatr rank
- Add leaderboards, streaks, event quests (unchanged)

**New tasks:**

1. Deploy Relatr Docker container alongside Oracle
2. Oracle subscribes to kind 30382 from Relatr's service key
3. Implement `getWotFactor()` mapping in Reward Publisher
4. Add trust gates to level-up checks
5. Client displays `wot-rank` on gamification profile
6. Add 30-day grace period for trust-loss level-downs

**Estimated savings:** ~2-3 weeks of graph analysis development removed from Phase 3.

### Phase 4: Extensions (Ongoing)

- Custom Relatr validator plugins for NosTube-specific signals (e.g., "has uploaded videos" as a trust signal)
- Federation: multiple Relatr instances, Oracle picks highest/average
- Cross-platform badge display (unchanged)

---

## Custom Relatr Validator Plugin (Future)

Relatr supports a plugin system for validators. We could contribute a NosTube-specific plugin:

```typescript
// Hypothetical NosTube validator plugin for Relatr
const nosTubeCreatorPlugin: ValidatorPlugin = {
  name: 'nostube_creator',
  weight: 0.05, // Small additional signal
  validate: async context => {
    // Check if user has published kind 34235 (video) events
    const hasVideos = await checkForVideoEvents(context.targetPubkey)
    return {
      valid: hasVideos,
      score: hasVideos ? 1.0 : 0.0,
      reason: hasVideos ? 'Has published videos' : 'No video events found',
    }
  },
}
```

This would give video creators a small trust boost in the global Relatr score, benefiting the broader Nostr ecosystem — not just NosTube.

---

## Summary

| Aspect                    | Without Relatr                                    | With Relatr                                              |
| ------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| **WoT Implementation**    | Custom follower counting, 5 tiers                 | Consume kind 30382, 6 tiers mapped from 0-100            |
| **Sybil Resistance**      | Basic follower count                              | Multi-signal: graph distance + NIP-05 + LN + reciprocity |
| **Graph Analysis**        | Build from scratch (Redis + custom code)          | Pre-built (DuckDB + PageRank in Relatr)                  |
| **Anti-Gaming**           | Custom graph analysis for colluding rings         | Relatr's distance decay + our zap-circle detection       |
| **Level Requirements**    | Points + min videos/mirrors                       | Points + Relatr rank gate                                |
| **Oracle Complexity**     | High (graph indexer + PageRank + Sybil detection) | Medium (action verification + point calculation)         |
| **Phase 3 Duration**      | ~4 weeks                                          | ~2 weeks                                                 |
| **External Dependencies** | None                                              | Relatr (MIT, self-hostable)                              |

**Recommendation:** Use **Option A** (consume NIP-85 events) for Phase 3. It gives us best-in-class Sybil resistance with minimal code, keeps our Oracle focused on gamification logic, and we can always self-host Relatr if the public instance is unreliable.
