# Apply public config edits while running; restart only for what is wired at start

Saving in the studio used to end the process every time, so a supervisor started it again on the new config (#7). Most saves only touch what the site reads: the public config (`/api/config`) and the relay's name. Those now apply while running; the process exits only when a save changes what `main` wires up once at start.

`Config::needs_restart` decides, comparing the saved config with the one on disk:

- **Restart:** `allowed_writers` (relay and Blossom allowlists), `storage` (Blossom limits), `mirror` (relay outbox jobs and the outbox worker). Origin and TLS are not editable.
- **While running:** `title`, `reach`, `creators`, `video_sources`, `interaction_relays`, `profile_relays`, `search` and `site`. `Branding::set_base` rebuilds the public config bytes (the branding URLs go in as before), `Relay::set_title` the NIP-11 document. Server-written pages (`seo`) read the public config, so they follow; the channel profile sync (and with it the relay list and the outbox's indexer targets, ADR 0012) runs after it.

Both ways validate first, run the preflight and keep `config.prev`. `PUT /api/admin/config` answers `restart: true|false`; the studio reloads at once, or waits for the new boot id as before. `revision` still bumps on every save, so a running site and the studio see the new revision on their next load.

## Considered Options

- **Rebuild the whole instance in process and swap it**: general, but Almond's state reads the blob folder on build, background tasks must be stopped, and open relay sessions keep the old writers until they disconnect.
- **Make every part live (writers, limits, mirror)**: needs a runtime policy in Almond; left for a later step. Until then those saves restart, and the restart policy (`deploy.md`) stays required.
