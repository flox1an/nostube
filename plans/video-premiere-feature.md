# Video Premiere Feature - Concept Plan

## Overview

This document outlines the architecture and implementation strategy for a YouTube-style video premiere feature in nostube, enabling synchronized live viewing experiences with real-time chat using Nostr, Blossom, HLS, and zap.stream technologies.

## Problem Statement

Users want to host video premieres where:
- A video is released at a specific date/time
- Viewers watch together synchronously
- Live chat is available during the premiere (via zap.stream/Nostr)
- After the premiere ends, the video becomes available as standard VOD

**Key Challenge**: Static HLS playlists allow seeking/skipping, breaking the synchronized "live" experience. A true premiere requires server-controlled progressive delivery.

## Technical Architecture

### Core Technologies

- **Nostr**: Event publishing, chat, social features
- **Blossom**: Video segment and asset storage
- **HLS**: Adaptive streaming protocol
- **NIP-53**: Nostr live event specification
- **zap.stream**: Live streaming client (view-only, no RTMP ingest)

### Architecture Decision: Dynamic HLS (Option A - Recommended)

Generate HLS as if it were a true live stream:
- Playlist grows segment-by-segment
- Only a small sliding window is visible (e.g., last 30-60 seconds)
- Old segments expire/disappear
- No seeking into the future is possible
- `EVENT` playlist type (not `VOD`)

**Why not static HLS?**
- Users can skip to the end
- No synchronized viewing experience
- Chat becomes desynchronized
- Loses "live" feeling

**Why not RTMP/traditional ingest?**
- Unnecessary complexity for pre-recorded content
- All video assets can be pre-generated
- Server-controlled HLS delivery achieves same UX

## System Components

### 1. Premiere Controller Service (Server-Side)

**Must be centrally controlled** - this is the authoritative source for:

#### Responsibilities:
- **Time management**: Track premiere start, current position, end time
- **HLS playlist generation**: Dynamically serve `.m3u8` with progressive segments
- **Nostr event orchestration**: Publish live events, status updates, final video event
- **Status state machine**: `upcoming → live → ended`

#### Key Properties:
- Single process/instance (not distributed)
- Uses dedicated **Nostube Premiere Key** for signing
- Cannot be client-side (requires authority and consistent timing)

### 2. Pre-Generated Assets (Static Storage)

**Can be created days in advance** and stored on Blossom:

- Countdown video (e.g., 2-minute animated countdown)
- Main video segments (`.ts` or `.m4s` files)
- Thumbnail images
- Final VOD playlist and/or MP4
- Audio tracks

**Important**: Segments are timeless/static, but the playlist is time-sensitive.

### 3. Nostr Key Architecture

#### Premiere Key (Server-Controlled)
- Owned by Nostube/platform
- Signs live stream events (NIP-53)
- Publishes status updates
- Represents the "channel" hosting the premiere

#### Creator Key (User-Owned)
- Owned by content creator
- Signs the final video event (NIP-71)
- Event can be **pre-signed** but **held unpublished** until premiere ends
- Maintains creator ownership of content

## Implementation Flow

### Phase 0: Preparation (Days Before)

**Server Tasks:**
1. Generate countdown video with premiere date/time
2. Concatenate countdown + main video
3. Segment video into HLS chunks:
   ```bash
   ffmpeg -i concat.mp4 \
     -c:v copy -c:a copy \
     -f hls -hls_time 6 \
     -hls_segment_filename "premiere_%d.ts" \
     segments.m3u8
   ```
4. Upload segments to Blossom
5. Generate final VOD assets (standard video event format)

**Creator Tasks:**
1. Create and sign video event (NIP-71, kind 34235/34236)
2. Include all metadata: title, description, tags, thumbnail
3. **Do not publish** - send signed event to server to hold
4. Server stores in "premiere queue"

**Database Schema:**
```typescript
interface Premiere {
  id: string;
  creatorPubkey: string;
  scheduledStart: number; // Unix timestamp
  status: 'upcoming' | 'live' | 'ended';

  // Pre-generated assets
  segmentHashes: string[]; // Blossom blob hashes
  segmentDurations: number[];
  countdownDuration: number;
  totalDuration: number;

  // Pre-signed events
  signedVideoEvent: NostrEvent; // Held until premiere ends
  liveEventId?: string; // Published during premiere
}
```

### Phase 1: Announcement (Hours/Days Before)

**Server publishes** (using Premiere Key):

```json
{
  "kind": 30311,
  "content": "Video Premiere: [Title]",
  "tags": [
    ["d", "premiere-{id}"],
    ["title", "My Video Premiere"],
    ["summary", "Join us for the premiere at..."],
    ["image", "thumbnail-url"],
    ["streaming", "https://nostube.example/premiere/{id}.m3u8"],
    ["status", "upcoming"],
    ["starts", "1735000000"],
    ["creator", "creator-pubkey"],
    ["t", "premiere"]
  ],
  "pubkey": "nostube-premiere-key",
  "created_at": 1734900000,
  "sig": "..."
}
```

**Client Experience:**
- Shows countdown timer
- "Notify me" / calendar reminder options
- Chat may already be open (pre-show discussion)
- Visible on zap.stream and nostube

### Phase 2: Premiere Start

**Exactly at `scheduledStart` timestamp:**

**Server Actions** (atomic):
1. Update premiere status: `upcoming → live`
2. Start HLS playlist generation service
3. Update Nostr live event:
   ```json
   {
     "kind": 30311,
     "tags": [
       ["status", "live"],
       ["current_participants", "42"]
     ]
   }
   ```

**HLS Playlist Generation Logic:**

```typescript
function generatePlaylist(premiere: Premiere): string {
  const now = Date.now() / 1000;
  const elapsed = now - premiere.scheduledStart;
  const currentSegmentIndex = Math.floor(elapsed / 6); // 6-sec segments

  // Show only last 10 segments (60-second window)
  const windowStart = Math.max(0, currentSegmentIndex - 10);
  const windowEnd = Math.min(currentSegmentIndex, premiere.segmentHashes.length - 1);

  const mediaSequence = windowStart;

  let playlist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:${mediaSequence}
#EXT-X-PLAYLIST-TYPE:EVENT
`;

  for (let i = windowStart; i <= windowEnd; i++) {
    const duration = premiere.segmentDurations[i];
    const hash = premiere.segmentHashes[i];
    playlist += `#EXTINF:${duration.toFixed(3)},\n`;
    playlist += `https://blossom.example/${hash}.ts\n`;
  }

  // Don't add ENDLIST until premiere is over
  return playlist;
}
```

**Playlist is served at**: `GET /premiere/{id}.m3u8`
- Regenerated every 2-3 seconds OR
- Generated on-demand with caching

**Client Experience:**
- Video player loads HLS
- Countdown plays (first N segments)
- Then main video begins
- Chat is active (Nostr kind 1 replies to live event)
- Zaps work normally
- **Seeking forward is blocked** (only past segments available)

### Phase 3: During Premiere

**Server:**
- Continuously updates playlist as time progresses
- No new Nostr events (just stream continues)
- Optional: periodic participant count updates

**Viewers:**
- Join at any time (see last 60 seconds)
- Cannot skip ahead
- Synchronized viewing (within ~10 seconds of each other)
- Active chat and zaps

**Technical Details:**
- HLS segments are pre-generated (static on Blossom)
- Only the **playlist is dynamic**
- No transcoding or re-encoding happens live
- Server is just controlling "release timing" of segments

### Phase 4: Premiere End

**When final segment is reached:**

**Server performs atomic transition:**

1. **Update HLS Playlist:**
   ```m3u8
   #EXTM3U8
   ... segments ...
   #EXT-X-ENDLIST
   ```
   OR stop serving playlist updates

2. **Update Live Event Status:**
   ```json
   {
     "kind": 30311,
     "tags": [["status", "ended"]]
   }
   ```

3. **Publish Creator's Video Event:**
   - Take pre-signed event from queue
   - Publish to Nostr relays
   - Now appears in normal video feeds

4. **Post Chat Message** (optional but recommended):
   ```json
   {
     "kind": 1,
     "content": "🎉 Premiere ended! Watch the full video here: nostr:nevent1...",
     "tags": [
       ["e", "live-event-id", "", "root"],
       ["e", "video-event-id", "", "mention"]
     ],
     "pubkey": "nostube-premiere-key"
   }
   ```

**Cleanup** (delayed, non-critical):
- Delete HLS playlist after 1 hour
- Optionally remove premiere segments from Blossom
- Update database: `status = 'ended'`

## User Experience Flow

### Creator Perspective

1. **Setup:**
   - Upload video to nostube (normal flow)
   - Instead of "Publish", choose "Schedule Premiere"
   - Select date/time
   - Optionally customize countdown
   - Event is signed but held

2. **Before Premiere:**
   - Receives confirmation
   - Can share announcement event
   - Can edit scheduled time (republishes announcement)

3. **During Premiere:**
   - Can participate in chat like any viewer
   - Sees live viewer count
   - Can moderate chat

4. **After Premiere:**
   - Video appears in their profile normally
   - Premiere chat history is preserved (Nostr events)
   - Can view analytics (views, zaps, etc.)

### Viewer Perspective

1. **Discovery:**
   - Sees "Upcoming Premiere" in feed
   - Countdown timer displayed
   - "Notify Me" button (browser notification or Nostr reminder)

2. **Arrival (before start):**
   - Can join "waiting room"
   - Chat may be active (pre-show)
   - Countdown visible

3. **During Premiere:**
   - Video plays automatically at scheduled time
   - Cannot skip ahead (synchronized)
   - Chat with other viewers
   - Send zaps
   - React with emojis/reactions

4. **After Premiere:**
   - Link to full video appears in chat
   - Clicking transitions to normal video page
   - **Chat context is lost** (this is the UX break)
   - Can watch video normally with full seek controls

## The Inevitable UX Break

### The Problem

Nostr's current architecture creates a hard boundary:
- **Live Event** (NIP-53, kind 30311) → has chat, zaps, live status
- **Video Event** (NIP-71, kind 34235) → standalone, no chat inheritance

**zap.stream cannot automatically redirect** from live event to video event.

### Why This Cannot Be Fixed Client-Side

- Clients don't have:
  - Reliable synchronized time
  - Authority to declare "premiere ended"
  - Ability to sign events on behalf of creator/platform
- The premiere is an **authoritative, synchronous ritual**
- Requires server control

### Mitigation Strategies

**Recommended Approaches:**

1. **Clear Messaging:**
   - Last 30 seconds of premiere: "Premiere ending soon, video will be available shortly"
   - Final chat message with direct link
   - Possibly pin the message

2. **Embed Transition Card:**
   - Last segment of premiere: overlay with "Click to watch full video"
   - Include QR code or short link

3. **Post-Premiere Landing Page:**
   - `/premiere/{id}` redirects to `/video/{videoId}`
   - Shows: "Premiere ended, watch the full video below"
   - Embeds video player
   - Shows archived chat (read-only)

4. **Nostr Protocol Enhancement** (future):
   - Propose NIP extension: `["redirect", "nevent1..."]` tag
   - zap.stream could honor this
   - Would allow seamless transition

### What Users Keep

✅ Full premiere chat history (Nostr events are permanent)
✅ All zaps received during premiere
✅ Viewer count statistics
✅ The video (now as standard VOD)

### What Users Lose

❌ Continuous context (feels like "leaving" the premiere)
❌ Active chat on video page
❌ Live event status/indicators

**This is a protocol limitation, not an implementation bug.**

## Technical Considerations

### HLS Playlist Management

**Option 1: Pre-Generate All Playlists**
- Create playlists for every second/segment in advance
- Serve static files based on current time
- Pros: Simple, cacheable
- Cons: Many files, storage overhead

**Option 2: Dynamic Generation**
- Generate playlist on-demand per request
- Calculate visible segments based on `now()`
- Pros: Minimal storage, flexible
- Cons: Requires active service, caching complexity

**Recommended: Option 2** with edge caching (1-2 second TTL)

### Blossom Storage Strategy

**Segment Storage:**
- Upload all segments before premiere
- Use descriptive names: `premiere_{id}_seg_{n}.ts`
- Or use hash-based storage (standard Blossom)

**Post-Premiere Cleanup:**
- Keep segments for 24-48 hours (allow late viewers to replay)
- Then delete to save space
- Or keep permanently if storage is cheap

**CDN/Caching:**
- Blossom servers should support HTTP caching headers
- Segments are immutable, cache aggressively
- Playlists have short TTL

### Scalability Considerations

**For 1-100 concurrent premieres:**
- Single Node.js/Go/Python service is sufficient
- Stateless playlist generation (reads from DB/cache)

**For 100-1000+ concurrent premieres:**
- Distribute playlist generation behind load balancer
- Shared Redis/Postgres for premiere state
- Consider dedicated CDN or Cloudflare Workers for playlist serving

**For viral premieres (10k+ viewers):**
- HLS handles this naturally (client-pull)
- Blossom must scale (CDN recommended)
- Nostr relay load increases (zaps, chat)

### Security & Abuse Prevention

**Premiere Key Protection:**
- HSM or secure key storage for Nostube premiere key
- Consider rotation policy
- Audit log all event publications

**Rate Limiting:**
- Limit premieres per user (e.g., 5/day)
- Prevent spam premieres

**Content Moderation:**
- Pre-screen premieres? (optional)
- Allow reporting during premiere
- Ability to emergency-stop premiere

**Playlist Integrity:**
- Serve playlist over HTTPS
- Consider signing playlist or segments (HLS supports this)

### Monitoring & Analytics

**Track:**
- Concurrent viewers (query Nostr or track HLS requests)
- Total unique viewers
- Zap amounts during premiere
- Chat message velocity
- Drop-off points (which segment users leave)
- Transition rate (premiere → video event)

**Alerting:**
- Premiere failed to start on time
- Zero viewers 5 minutes after start (dead stream)
- Blossom segment fetch failures
- Nostr relay publish failures

## Implementation Phases

### Phase 1: MVP (Core Premiere Flow)
**Scope:**
- Server-side premiere controller service
- HLS playlist generation (dynamic EVENT type)
- Pre-generate countdown + segments
- Publish NIP-53 live events (basic)
- Manual premiere creation (admin tool)
- Basic viewer experience (play video, see chat)

**Deliverables:**
- `/api/premiere/create` endpoint
- `/premiere/{id}.m3u8` playlist endpoint
- Background service for premiere lifecycle
- Simple UI: "Upcoming Premieres" page
- Basic countdown overlay

**Timeline:** 2-3 weeks

### Phase 2: Creator Tools & UX
**Scope:**
- "Schedule Premiere" button in upload flow
- Countdown customization (templates, custom video)
- Premiere preview (test before scheduling)
- Edit/cancel scheduled premieres
- Notification system (remind viewers)

**Deliverables:**
- Upload flow integration
- Premiere management dashboard
- Email/Nostr notifications
- Mobile-responsive premiere viewer

**Timeline:** 2-3 weeks

### Phase 3: Enhanced Experience
**Scope:**
- Transition improvements (premiere → video)
- Archived premiere chat viewer
- Analytics dashboard (for creators)
- Multi-quality HLS (adaptive bitrate)
- Thumbnail previews in waiting room

**Deliverables:**
- Post-premiere landing page
- Creator analytics UI
- ABR HLS support
- Enhanced waiting room

**Timeline:** 2-3 weeks

### Phase 4: Scale & Optimize
**Scope:**
- CDN integration for segments
- Playlist generation optimization
- Load testing (1000+ concurrent viewers)
- Blossom mirroring strategy
- Advanced moderation tools

**Deliverables:**
- CDN configuration
- Performance benchmarks
- Scaling documentation
- Moderation dashboard

**Timeline:** 1-2 weeks

## Open Questions & Decisions Needed

### 1. Premiere Key Management
**Question:** Should Nostube run one shared premiere key or generate unique keys per premiere?

**Options:**
- **Shared Key:** Simple, consistent branding
- **Per-Premiere Key:** Better isolation, but key management complexity

**Recommendation:** Start with shared key, evaluate need for isolation later.

### 2. Segment Retention Policy
**Question:** How long to keep premiere segments after end?

**Options:**
- Delete immediately (save space)
- Keep 24 hours (allow replays)
- Keep permanently (full archive)

**Recommendation:** Keep 48 hours, then delete. Final video event has VOD assets.

### 3. Countdown Customization
**Question:** How much control do creators get over countdown?

**Options:**
- Fixed template only
- Choose from 5-10 templates
- Upload custom countdown video
- Fully custom with graphics overlay

**Recommendation:** Start with 3 templates, add custom upload in Phase 2.

### 4. Chat Persistence
**Question:** Should premiere chat be viewable after premiere ends?

**Options:**
- Yes, on video page (requires UI work)
- Yes, on separate "Premiere Archive" page
- No, chat is ephemeral (live-only)

**Recommendation:** Yes, on separate archive page. Link from video event.

### 5. Multi-Stream Support
**Question:** Should one premiere support multiple quality/language streams?

**Options:**
- Single stream only (simpler)
- Multiple HLS variants (adaptive bitrate)
- Multiple language tracks

**Recommendation:** Phase 1 = single stream. Phase 3 = add ABR.

### 6. Blossom vs Traditional CDN
**Question:** Should we rely solely on Blossom or integrate a traditional CDN?

**Options:**
- Pure Blossom (decentralized, on-brand)
- Hybrid (Blossom + Cloudflare/CloudFront)
- Traditional CDN only

**Recommendation:** Start pure Blossom, add CDN fallback if performance requires.

## Success Metrics

### Technical KPIs
- Premiere start time accuracy: < 5 second deviation
- Playlist generation latency: < 100ms
- Segment load success rate: > 99.5%
- Nostr event publish success: > 99%

### User Experience KPIs
- Premiere completion rate: > 70% (users who join finish watching)
- Transition click-through rate: > 50% (premiere → video)
- Average concurrent viewers per premiere: > 10
- Creator satisfaction: > 8/10

### Business KPIs
- Premieres scheduled per week: > 20
- Total premiere views: > 1000/week
- Zaps during premieres: > 10k sats/week
- Repeat creators (schedule 2+ premieres): > 30%

## Alternative Architectures Considered

### Alternative 1: Pure Client-Side Coordination
**Idea:** Clients synchronize by looking at `starts` timestamp and locally controlling playback.

**Rejected Because:**
- Clock drift across clients (seconds to minutes)
- Cannot prevent seeking
- No authoritative state
- Easy to manipulate

### Alternative 2: RTMP Ingest with Server-Side Playout
**Idea:** Use traditional streaming setup, server ingests pre-recorded video via RTMP.

**Rejected Because:**
- Unnecessary complexity (RTMP server, transcoding)
- Higher latency
- More moving parts
- Doesn't leverage pre-generated assets

### Alternative 3: WebRTC-Based Synchronization
**Idea:** Use WebRTC to distribute video peer-to-peer with synchronized playback.

**Rejected Because:**
- Very complex (TURN servers, signaling)
- Poor scalability (mesh or SFU needed)
- Incompatible with Nostr's model
- Reinventing HLS

### Alternative 4: Blockchain Smart Contract Timing
**Idea:** Use blockchain timestamps to prove premiere start/end times.

**Rejected Because:**
- Overkill (Nostr events already timestamped)
- Adds dependency and complexity
- Doesn't solve seeking problem
- Slower than centralized timing

## Future Enhancements

### Short-Term (Next 6 Months)
- **Multi-language premieres**: Different audio tracks
- **Premiere replays**: Allow "replay premiere" with original chat
- **Countdown templates**: Library of animated countdowns
- **Premiere reminders**: Nostr + email + push notifications
- **Co-hosting**: Multiple creators share one premiere

### Medium-Term (6-12 Months)
- **Interactive premieres**: Polls during premiere, live Q&A
- **Premiere reactions**: Real-time emoji reactions overlay
- **Scheduled series**: Auto-schedule episode premieres
- **Premiere clips**: Create shareable moments during live chat
- **Community premieres**: Anyone can submit video for scheduled time slot

### Long-Term (12+ Months)
- **Protocol proposal**: NIP for native premiere support
- **Premiere federation**: Other Nostr apps can host premieres
- **Hybrid live/premiere**: Start as live stream, continue as premiere replay
- **Virtual premiere halls**: 3D/VR waiting rooms (metaverse integration)
- **Decentralized playlist**: IPFS or distributed HLS segments

## Conclusion

Video premieres represent a compelling middle ground between live streaming and traditional video uploads. By leveraging HLS's adaptive delivery with server-controlled progressive segment release, we can create a synchronized viewing experience without the complexity of real-time transcoding or RTMP infrastructure.

**Key Takeaways:**

1. ✅ **Technically Feasible**: HLS EVENT playlists + Nostr events = viable premiere system
2. ⚠️ **UX Compromise Required**: Hard transition from live event to video event is unavoidable with current Nostr protocol
3. 🔧 **Server Authority Needed**: Cannot be purely decentralized; premiere timing requires centralized control
4. 📦 **Blossom-Compatible**: Pre-generated segments work well with Blossom storage model
5. 🎯 **MVP is Achievable**: Core feature can be delivered in 2-3 weeks

**Recommendation:** Proceed with implementation, starting with Phase 1 MVP to validate the concept with real users.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-22
**Status:** Concept / Awaiting Approval
