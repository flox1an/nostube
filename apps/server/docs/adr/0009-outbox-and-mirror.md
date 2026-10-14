# A durable outbox copies the instance's own events and videos to mirror targets the owner chose

> **Status:** extended by [ADR 0013](0013-nsite-hosting.md) for streamed byte uploads from non-public origins, nsite publication dependencies and owner-authorized deletion; [ADR 0014](0014-interaction-import.md) records a separate, not-yet-implemented opt-in interaction inbox.

The spec ("Externe Synchronisierung", "Follow versus lokale Redundanz") asks for redundancy that is explicit: nothing leaves the instance unless the owner named the target, a target that is down must not lose anything, and a mirrored file must be confirmed by hash and size. This is the first part of it: the instance's own content goes out; nothing comes in.

**Opt-in `[mirror]` (config.toml, studio Advanced page).** `relays` (`ws(s)://`) receive every new event of the instance's allowed writers; `blossom` (`http(s)://`) servers receive every blob that finished uploading. Empty lists mean no mirror work; public channel announcements and explicit nsite deletion may still need a worker. Changing mirror lists restarts the instance (ADR 0010); ordinary jobs to removed targets wait, while owner-authorized nsite deletion jobs retain their historical targets.

**The outbox is a table in `relay.sqlite`.** One row is one item for one target: `kind` (`event` or `blob`), `target`, `ref_id` (event id or blob sha256), blob `size` and `source_url`, `status` (`pending`, `done`, `failed`), `attempts`, `next_attempt_at`, `last_error`. `UNIQUE (kind, target, ref_id)` makes enqueueing idempotent. The same file as the relay means an event and its jobs are written in one transaction (`relay::persist`): a stored event always has its jobs, and a crash never leaves a job for an event that is not there. Blob jobs are written after Blossom answered an upload with a blob descriptor (`PUT /upload`, `PUT /mirror`); the `204` answers of `PATCH` chunks carry no descriptor and queue nothing.

**What is queued.** Only events of allowed writers that are new to this relay. A visitor's comment, reaction or deletion (ADR 0006) is stored but is not this instance's content, and an event that arrived from another instance's outbox is stored and not passed on (the outbox sends `User-Agent: nostube-outbox/<version>`; the relay and the Blossom dispatcher recognise it), so two instances that mirror each other do not ping-pong.

**Worker.** One background task, polling every 5 s, at most 4 deliveries at once. A failed delivery is retried after `30 s · 2^(n-1)` (cap 1 h), with the delay jittered down to between half and all of it so that jobs that failed together do not come back together. After 24 failed attempts (about a day) the job is `failed` until the owner presses Retry in the studio (`POST /api/admin/outbox/retry`, optionally for one target), which gives it a fresh set of attempts. Stopping the server drops running deliveries; they stay `pending` and go out after the restart. Delivery is idempotent on the other side, so an interrupted job is simply sent again.

- **Events** go over a WebSocket (`EVENT`, wait up to 30 s for the matching `OK`). `OK false` with a `duplicate:` message is success. An event that a newer version replaced or its author deleted here is not sent; the replacement or the deletion has its own job.
- **Blobs** use BUD-04 `PUT <target>/mirror` when the instance origin is public. Otherwise they stream local bytes into `PUT <target>/upload` without buffering entire files (ADR 0013). Both use a managed-key BUD-11 upload token (kind 24242, `t=upload`, `x=<sha256>`) and complete only after hash and size confirmation, including an already-present target copy. Without a managed key jobs fail with "mirroring blobs needs the managed signing key"; the browser signer is never involved. Large uploads have a bounded timeout; interrupted transfers retain the existing backoff. Redirects are not followed.

**Status.** `GET /api/admin/outbox` returns the targets, the counts per target and kind (`pending`/`done`/`failed`) and the 50 most recent items that have a problem, each with its last error (cut at 300 characters, they come from other servers). The studio shows this under the mirror targets and only when targets are configured.

**Targets come only from the owner's config.** The outbound requests go to nothing else, so there is no request-forgery path from visitors or from event content. A target may be a LAN address (`ws://`/`http://` are allowed, as for the instance's own relay lists); that is the owner's choice.

## Considered Options

- **A separate database file for the outbox**: rejected. It could not share the event's transaction, and a stored event could lose its jobs in a crash.
- **Enqueue by scanning the relay for events newer than a cursor**: rejected. It cannot tell a replayed event from a new one, and it needs a cursor per target.
- **Sign mirror requests in the browser (the studio's signer)**: rejected. Jobs run without the owner; only a server-held key can sign then. An owner with their own key can mirror events (no signing needed) but not blobs.
- **Always push bytes instead of `PUT /mirror`**: rejected; public origins retain the cheaper pull request. ADR 0013 implements streamed push only where targets cannot reach the instance.
- **kind 1063 mirror announcements for the copies** (docs/plans/2026-02-04-mirror-1063-publishing-design.md): a separate follow-up. Clients find a copy only if the event lists it; this change makes the copies, not the announcements.
- **Pull mirroring of other creators' content ("follow")**: out of scope; the spec keeps displayed creators and locally mirrored assets apart.
