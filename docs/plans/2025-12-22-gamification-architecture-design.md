# Nostube Gamification Architecture Design

## Overview

A comprehensive gamification system for Nostube to improve user-generated content quality, community moderation, metadata enrichment, 720p video uploads, and Blossom server distribution.

**Key Principles:**

- Fully decentralized communication via Nostr events (no direct API)
- Hybrid verification: automatic for verifiable actions, Oracle for subjective
- NIP-58 Badges for achievements and roles
- Central Oracle as trusted observer and badge issuer

## System Architecture

```
┌──────────────┐                    ┌──────────────┐
│   CLIENT A   │                    │   CLIENT B   │
└──────┬───────┘                    └──────┬───────┘
       │ publish                           │ subscribe
       ▼                                   ▼
┌─────────────────────────────────────────────────────┐
│                    NOSTR RELAYS                     │
│                                                     │
│  ← kind 30078: Action Claims (User → Oracle)       │
│  → kind 30079: Score Updates (Oracle → User)       │
│  → kind 30009: Badge Definitions (Oracle)          │
│  → kind 8: Badge Awards (Oracle → User)            │
│  → kind 30080: Quest Definitions (Oracle)          │
│  → kind 30081: Quest Progress (Oracle → User)      │
│                                                     │
└─────────────────────────────────────────────────────┘
       ▲
       │ subscribe + publish
       │
┌──────┴───────┐
│    ORACLE    │ (just another Nostr client)
└──────────────┘
```

## Event Types

All events use NIP-78 App-specific Data (kinds 30078-30081) plus NIP-58 Badges:

| Kind    | Name             | Direction     | Description                           |
| ------- | ---------------- | ------------- | ------------------------------------- |
| `30078` | Action Claim     | User → Oracle | "I mirrored video X to server Y"      |
| `30079` | Score Update     | Oracle → User | "User now has 1250 points, Level 4"   |
| `30080` | Quest Definition | Oracle → All  | "Weekly: Mirror 3 videos → 50 points" |
| `30081` | Quest Progress   | Oracle → User | "Quest 'Mirror 3': 2/3 complete"      |
| `30009` | Badge Definition | Oracle → All  | NIP-58 Badge "Trusted Moderator"      |
| `8`     | Badge Award      | Oracle → User | NIP-58 "User X receives Badge Y"      |

### Action Claim Flow (Example: Mirror)

1. User mirrors video to new Blossom server
2. Client publishes `kind:30078` Action Claim with proof (hash, server URL)
3. Oracle subscribes to `kind:30078`, sees claim
4. Oracle verifies: HEAD request to Blossom server, hash matches?
5. Oracle publishes `kind:30079` Score Update (+20 points)
6. Oracle checks quest progress, publishes `kind:30081`
7. If level-up: Oracle publishes new `kind:30079` + possibly `kind:8` Badge

## Point System

### Point Sources

| Category         | Action                        | Points    | Verification                     |
| ---------------- | ----------------------------- | --------- | -------------------------------- |
| **Content**      | Upload video (first)          | +100      | Blob exists                      |
|                  | Add 720p variant              | +50       | Blob + dimension check           |
|                  | Upload thumbnail              | +10       | Blob exists                      |
|                  | Good metadata                 | +5 to +30 | Oracle algorithm                 |
| **Distribution** | Mirror to 1 additional server | +20       | HEAD request                     |
|                  | Mirror to 3+ servers          | +50 bonus | HEAD requests                    |
| **Moderation**   | NSFW correctly marked         | +15       | Community consensus              |
|                  | Spam reported (confirmed)     | +25       | Moderator review                 |
|                  | False report                  | **-50**   | Moderator review                 |
| **Engagement**   | Zaps received                 | +0.01/Sat | Zap events (capped: max 100/day) |
|                  | Video reposted                | +5        | Repost events                    |

### Negative Point Decay

- Negative points decay 10% per week
- After 10 weeks, a -50 penalty is practically neutralized
- Prevents permanent "punishment", incentivizes improvement

## Level System

| Level | Points | Name        | Unlocked Features                   |
| ----- | ------ | ----------- | ----------------------------------- |
| 0     | 0      | Newcomer    | Only watch videos                   |
| 1     | 50     | Viewer      | Comment, Like                       |
| 2     | 200    | Contributor | Upload videos                       |
| 3     | 500    | Creator     | Advanced upload features            |
| 4     | 1,500  | Trusted     | Moderation reports count more       |
| 5     | 5,000  | Veteran     | Can qualify for Moderator badge     |
| 6     | 15,000 | Legend      | Community highlight, special badges |

### Level Requirements (not just points)

- Level 4 → additionally: Min. 10 videos uploaded OR 20 mirrors
- Level 5 → additionally: 5 confirmed moderation reports, no active penalties

## Badge System

### Badge Categories

| Category               | Badge                                   | Requirements                          | Effect                         |
| ---------------------- | --------------------------------------- | ------------------------------------- | ------------------------------ |
| **Level Badges**       | Bronze, Silver, Gold, Platinum, Diamond | Reach Level 2, 3, 4, 5, 6             | Visual status                  |
| **Role Badges**        |                                         |                                       |                                |
|                        | Creator                                 | 10+ videos, 500+ points               | Upload priority at DVMs        |
|                        | Curator                                 | 50+ correct tag/metadata edits        | Can suggest tags               |
|                        | Moderator                               | Level 5 + 20 confirmed reports + quiz | Reports have higher weight     |
|                        | Archivar                                | 100+ mirrors to 3+ servers            | Access to archive tools        |
| **Achievement Badges** |                                         |                                       |                                |
|                        | Early Adopter                           | Account before date X                 | Exclusive, no longer available |
|                        | Trending                                | Video in top 10 of the week           | Temporary (1 week visible)     |
|                        | Whale                                   | 100k+ sats zapped                     | Visual flex                    |
|                        | Event Champion                          | Won community event                   | Event-specific                 |

### Moderation Hierarchy

```
Normal User (Level 0-3)
    │ Report counts 1x
    ▼
Trusted User (Level 4)
    │ Report counts 2x
    ▼
Moderator Badge
    │ Report counts 5x
    │ Can confirm/reject other reports
    ▼
Oracle Admin (manually assigned)
    │ Final decision on disputes
```

### Moderator Quiz

- Part of Level 5 progression
- 10 example videos to rate (NSFW? Spam? OK?)
- 8/10 must match community consensus
- On fail: Wait 7 days, then retry
- Quiz questions generated from real, already moderated cases

## Quest System

### Quest Types

| Type           | Duration | Examples                                      | Reset            |
| -------------- | -------- | --------------------------------------------- | ---------------- |
| **Onboarding** | One-time | "Complete profile", "Upload first video"      | Never            |
| **Daily**      | 24h      | "Rate 1 video", "Write 1 comment"             | Midnight UTC     |
| **Weekly**     | 7 days   | "Mirror 3 videos", "Create 720p for 2 videos" | Monday 00:00 UTC |
| **Milestone**  | One-time | "100 videos mirrored", "Reached Level 5"      | Never            |
| **Event**      | Limited  | "Archive 50 videos from Creator X"            | Event end        |

### Quest Definition Event (kind 30080)

```json
{
  "kind": 30080,
  "pubkey": "<oracle-pubkey>",
  "tags": [
    ["d", "weekly-mirror-3"],
    ["name", "Mirror Master"],
    ["description", "Mirror 3 videos to other Blossom servers"],
    ["type", "weekly"],
    ["target", "3"],
    ["action", "mirror"],
    ["reward-points", "50"],
    ["reward-badge", ""],
    ["expires", "1735689600"]
  ],
  "content": ""
}
```

### Quest Progress Event (kind 30081)

```json
{
  "kind": 30081,
  "pubkey": "<oracle-pubkey>",
  "tags": [
    ["d", "<user-pubkey>:weekly-mirror-3"],
    ["p", "<user-pubkey>"],
    ["quest", "30080:<oracle-pubkey>:weekly-mirror-3"],
    ["progress", "2"],
    ["target", "3"],
    ["status", "in_progress"],
    ["expires", "1735689600"]
  ],
  "content": ""
}
```

### Streak Bonuses

- 7 consecutive days Daily Quest → +50 bonus
- 4 consecutive weeks Weekly Quest → +200 bonus + "Consistent" badge
- Streak breaks on pause → Reset to 0

### Level-scaled Rewards

| Quest  | Level 0-2 | Level 3-4 | Level 5-6 |
| ------ | --------- | --------- | --------- |
| Daily  | 5 points  | 8 points  | 12 points |
| Weekly | 30 points | 50 points | 75 points |

## Anti-Spam & Anti-Gaming

### Attack Scenarios and Countermeasures

| Attack              | Example                          | Countermeasure                                                            |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| **Spam Uploads**    | 100 empty videos                 | Min. file size (1MB), rate limit (5/day for Level 0-2)                    |
| **Self-Mirroring**  | Mirror own videos to own servers | Only "foreign" videos count (different pubkey)                            |
| **Mirror-Farming**  | Mirror same file 100x            | Max 5 mirrors per video rewarded                                          |
| **Sybil Attack**    | Create many fake accounts        | Level 0-1 get minimal points; Web-of-Trust (NIP-51 Follows) as multiplier |
| **Zap-Washing**     | Zap yourself                     | Ignore self-zaps; only zaps from Level 2+ count                           |
| **False Reports**   | Mass false reports               | Decay + temporary report ban after 3+ strikes                             |
| **Metadata Spam**   | Copy-paste descriptions          | Similarity check; identical texts → 0 points                              |
| **Colluding Rings** | Group zaps each other            | Graph analysis; closed zap circles → reduced value                        |

### Rate Limits (per 24h)

| Level | Uploads | Mirrors | Reports | Zap Points Cap |
| ----- | ------- | ------- | ------- | -------------- |
| 0-1   | 1       | 5       | 2       | 10             |
| 2-3   | 5       | 20      | 10      | 50             |
| 4-5   | 20      | 100     | 50      | 100            |
| 6     | ∞       | ∞       | ∞       | 200            |

### Web-of-Trust Multiplier

```
Effective Points = Base Points × WoT Factor

WoT Factor:
- 0 followers from Level 3+ users: 0.1x (minimal points)
- 1-5 followers: 0.5x
- 6-20 followers: 1.0x (normal)
- 21-100 followers: 1.2x
- 100+ followers: 1.5x
```

### Cooling-off Periods

- After 3 false reports: 7-day report ban
- After level-down (due to penalties): 14 days no level-up possible
- Suspicious activity (suddenly 50 mirrors): manual review queue

## Oracle Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GAMIFICATION ORACLE                        │
│                                                                 │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐  │
│  │ Event         │    │ Verification  │    │ Reward        │  │
│  │ Ingester      │───▶│ Workers       │───▶│ Publisher     │  │
│  └───────────────┘    └───────────────┘    └───────────────┘  │
│         │                    │                    │            │
│         ▼                    ▼                    ▼            │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL                            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │  │
│  │  │ users   │ │ actions │ │ quests  │ │ badges  │       │  │
│  │  │ scores  │ │ pending │ │ progress│ │ awards  │       │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                                 │
│                              ▼                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Redis (Cache)                         │  │
│  │  - Rate Limits    - WoT Graph    - Hot Quests           │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Event Ingester

- Subscribes to relays: `kinds: [30078, 9735, 1, 6, 7, 34235, 34236]`
- Filters relevant events (Action Claims, Zaps, Reposts, Videos)
- Writes to `actions_pending` queue

### Verification Workers (parallel)

- Read from queue
- Depending on action type:
  - **Mirror Claim:** HEAD request to Blossom server, verify hash
  - **Upload Claim:** Blob existence + metadata validation
  - **Zap:** Validate zap receipt (NIP-57)
  - **Report:** Queue for moderation consensus check
- Write result: `verified` / `rejected` / `pending_review`

### Reward Publisher

- Calculates points (incl. WoT multiplier, rate limits)
- Updates user score in DB
- Checks level-up / quest completion
- Signs and publishes Nostr events:
  - `kind:30079` Score Update
  - `kind:30081` Quest Progress
  - `kind:8` Badge Award (on unlock)

### Scaling

- Workers horizontally scalable
- Event Ingester can be split across relay groups
- Redis caches frequent lookups (user level, active quests)

## Client Integration (Nostube UI)

### New UI Components

**1. Profile Header Extension:**

```
┌─────────────────────────────────────────────────────────────┐
│  Header                                          [🔔] [👤]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Level 4 ████████░░ 1,250/1,500 XP    🛡️ 📦          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**2. Quest Widget:**

```
┌──────────────────────────┐
│ 📋 Active Quests         │
├──────────────────────────┤
│ Daily: Rate video        │
│ ████████░░ 1/1 ✓ +5 XP  │
├──────────────────────────┤
│ Weekly: 3 Mirrors        │
│ ██████░░░░ 2/3   +50 XP │
├──────────────────────────┤
│ 🔥 Streak: 5 days        │
└──────────────────────────┘
```

**3. Action Feedback:**

- After mirror: "+20 XP" animation
- After level-up: Confetti + modal
- After badge unlock: Badge reveal animation

**4. Gamification Profile Page (`/profile/gamification`):**

- Complete statistics
- All badges (earned + locked)
- Quest history
- Leaderboard position
- Activity graph (like GitHub Contributions)

**5. Leaderboard Page (`/leaderboard`):**

- Filter: All-time / Month / Week
- Categories: Overall / Creators / Moderators / Archivars

### Client Event Subscriptions

```typescript
const filters = [
  { kinds: [30079], '#p': [userPubkey] }, // Score updates
  { kinds: [30081], '#p': [userPubkey] }, // Quest progress
  { kinds: [8], '#p': [userPubkey] }, // Badge awards
  { kinds: [30080], authors: [oraclePubkey] }, // Quest definitions
]
```

## Implementation Phases

### Phase 1: MVP (4-6 weeks)

| Component        | Scope                                                            |
| ---------------- | ---------------------------------------------------------------- |
| **Oracle**       | Base service: Event Ingester, Score calculation, Nostr publisher |
| **Verification** | Only automatically verifiable actions (Mirror, Upload, Zaps)     |
| **Points**       | Simple point system without WoT multiplier                       |
| **Levels**       | 6 level tiers, points-only (no extra requirements)               |
| **Quests**       | 3 onboarding quests, 1 daily, 1 weekly                           |
| **Badges**       | Level badges + 2 role badges (Creator, Archivar)                 |
| **Client**       | Header integration, simple quest widget, toast feedback          |
| **Anti-Gaming**  | Rate limits, self-mirror block                                   |

### Phase 2: Moderation (3-4 weeks)

| Component           | Scope                                       |
| ------------------- | ------------------------------------------- |
| **Reports**         | NSFW/Spam reports with consensus mechanism  |
| **Moderator Badge** | Quiz system for unlock                      |
| **Weighting**       | Reports weighted by level/badge             |
| **Penalties**       | Negative points with decay                  |
| **Anti-Gaming**     | False report detection, cooling-off periods |

### Phase 3: Social & Polish (3-4 weeks)

| Component         | Scope                                                 |
| ----------------- | ----------------------------------------------------- |
| **WoT**           | Web-of-Trust multiplier based on follows              |
| **Leaderboards**  | Global + categorized                                  |
| **Streak System** | Daily/Weekly streaks with bonus                       |
| **Event Quests**  | Community events with temporary quests                |
| **UI Polish**     | Animations, gamification profile page, activity graph |
| **Anti-Gaming**   | Graph analysis for colluding rings                    |

### Phase 4: Extensions (ongoing)

- Curator badge (rate metadata quality)
- Premium features for high levels?
- Cross-platform (other Nostr clients can display badges)
- Decentralized Oracle federation (multiple trusted issuers)

## Technology Stack

| Component      | Technology                           |
| -------------- | ------------------------------------ |
| Oracle Service | Node.js/TypeScript or Rust           |
| Database       | PostgreSQL                           |
| Cache          | Redis                                |
| Nostr Library  | nostr-tools (JS) or nostr-sdk (Rust) |
| Job Queue      | BullMQ (Redis-based)                 |
| Hosting        | VPS or Container (Docker/Kubernetes) |

## Inspiration

This design incorporates concepts from Bilibili's gamification system:

- Level system (LV0-LV6)
- Virtual currency integration (Zaps as B-Coins equivalent)
- Fandom/role badges
- Onboarding challenges as part of progression
- Social proof and reputation systems
- Streak mechanics for engagement

## Open Questions

1. Should there be premium features for high-level users?
2. How to handle Oracle key rotation/migration?
3. Federation of multiple Oracle instances?
4. Integration with other Nostr clients displaying badges?
