# Storage and S3

Every instance has a built-in Blossom server for its media: videos, thumbnails, subtitles, and the
files of a published nsite. It is the [Almond](https://flox1an.github.io/almond/) Blossom server, linked
into Nostube Server as a library and served on the instance's own origin. For Blossom in general, see
[Blossom storage](/media/blossom).

Only **allowed writers** may upload; everyone can read. With no allowed writers, nobody can upload or
ask the instance to mirror a file. By default files are stored on the local disk in `<data>/blossom/`,
which keeps the instance fully usable offline.

## Limits

| Limit | Default | Where | Meaning |
| --- | --- | --- | --- |
| Per-file maximum | 4 GiB | fixed | The size ceiling for any single file: a video, an HLS segment, a thumbnail |
| Storage quota | `0` (unlimited) | Studio **Server → General → Storage**, `quota_gib` | Ceiling on the total size of stored media, local and S3 together |
| Free-space reserve | 5 GiB | Studio, `free_space_reserve_gib` | Disk space always left free on the host; uploads that would cut into it are refused |

The local disk stages every upload, also with S3, so the free-space reserve always applies to it.
Changing the storage settings restarts the instance. **Server → Statistics** shows used storage, the
quota and free disk space.

## S3-compatible storage

Under **Server → General → Storage**, select **S3-compatible storage (advanced)** to send new uploads
to a bucket at Cloudflare R2, AWS S3, MinIO, Garage or another provider instead of this machine. The
default **This machine** option remains the simple, offline-capable setup.

| Field | Notes |
| --- | --- |
| Endpoint | The provider's S3 API address. Use `https://`; `http://` only for a trusted endpoint inside your own network |
| Bucket | The bucket name |
| Region | Leave empty for `auto` (Cloudflare R2, MinIO, Garage). AWS needs the bucket's region, such as `eu-central-1` |
| Path-style addressing | Usually needed for MinIO and Garage: the bucket goes into the path instead of the host name |
| Access key ID | |
| Secret access key | Write-only, see below |

The credentials need object put, get and delete permissions and bucket listing permission, including
for the `.almond-probe/` keys used by the connection test.

**Test connection** writes a test object, reads it back, lists the bucket and deletes the object. It
reports the failing step and the provider's error, removes its test object on success, and attempts
cleanup after a failure. A test has a 30-second deadline.

### The secret access key

The secret is stored in the private `<data>/secrets.toml` (`s3_secret_access_key`), never in
`config.toml` and never in a config response. **Set** means a secret is stored; leaving the field empty
keeps it. Back up `secrets.toml` together with the configuration.

Saving new or changed S3 settings, or a new secret, runs the connection test first; the save is refused
if it fails. A successful save restarts the instance. An unchanged S3 configuration needs no successful
test, so other settings stay editable while the bucket is unavailable.

S3 cannot be turned off once enabled, because files in the bucket would become unreachable. Moving files
back to local storage is not supported.

### Hybrid storage

Storage is decided per file. Existing local uploads stay where they are and keep playing; new uploads
and the branding and nsite files the instance stores in Blossom go to S3. Downloads and Range requests
still pass through the
instance. Mirroring and deletion use each file's recorded location. The storage quota counts local and
S3 files together.

### Moving existing files

Once S3 is enabled, the Storage card shows how many files are still on this machine and offers **Move
existing files to S3**. The move runs in the background with file and byte progress, and videos keep
playing:

- One file at a time is copied and uploaded; its index entry is switched and the local copy removed
  only after the upload to the bucket succeeded.
- Leave room for one extra file above the local free-space reserve.
- A running move resumes after a restart (its state is in `<data>/storage-move.json`). A failed move
  shows its error and can be started again.
- Re-uploading the file currently being moved answers `503` with `Retry-After: 5`; other uploads and
  mirrors are unaffected.
- Upstream cache files stay local.
- Do not change the bucket while a move is running.

### When the bucket is unavailable

If the bucket cannot be listed at startup, the instance and Studio still start and local files remain
available. Studio shows **S3 storage is unavailable** with the last attempt and a link to correct the
settings. Requests for files that may be in the bucket, and new uploads, answer `503` rather than
pretending the files are missing. The server retries the listing and restores S3 access by itself when
it succeeds; no restart is needed.

A missing or incomplete S3 configuration is still a startup error. In particular, `[storage.s3]` in
`config.toml` without `s3_secret_access_key` in `secrets.toml` stops the start: restore the secret
before starting.

## Mirrors as backups

The outbox can copy uploaded media to other Blossom servers, and events to other relays, as soon as
they are stored ([ADR 0009](https://github.com/flox1an/nostube/blob/main/apps/server/docs/adr/0009-outbox-and-mirror.md)).
Configure the targets under **Server → Advanced → Mirror to other servers**:

| List | Format | Copies |
| --- | --- | --- |
| Mirror relays | `ws://` or `wss://`, one per line | Every new event of the allowed writers |
| Mirror Blossom servers | `https://`, or `http://` on the LAN, one per line | Uploaded media files |

Notes:

- Copying media needs the channel identity: the server signs the mirror requests with the managed key.
  With own identity, media is not mirrored.
- Only targets you list are contacted; there are no default mirror servers. Their limits, quotas and
  availability are your concern.
- Mirrors work in Private and Public reach. In Public reach without a public origin, the public mirrors
  carry everything public (see [Reach](/server/studio#reach)).
- The outbox keeps retrying while a target is down; pending jobs survive restarts. **Mirror status**
  shows done, waiting and failed jobs per target, and **Retry failed** queues failed jobs again.
- Deleting a video in Studio also removes its unused media from the configured mirrors.
- Changing the mirror lists restarts the instance.

Mirrors protect the media and events, not the instance itself: back up the data directory as well, see
[Backups](/server/operations#backups).
