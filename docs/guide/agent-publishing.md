# Publish videos with an AI agent

The **Nostr Video Publisher** skill teaches an AI coding agent to inspect and prepare media, create thumbnails, upload files to Blossom, and sign and publish [NIP-71 video events](/developers/nip-71). It works with public Nostr relays and Blossom servers; a Nostube Server is optional.

A skill is a set of instructions, not a hosted service or an executable. Installing it does not install media tools, create a Nostr identity, upload files or publish anything.

## Install

With Node.js and npm installed, run this in the project where you use your agent:

```bash
npx skills add flox1an/nostube --skill nostr-video-publisher
```

Choose your agent in the installer, for example Claude Code, Codex or OpenCode. Add `-g` to make the skill available across projects. For manual installation, copy the whole skill directory, including its references; see the [installation instructions](https://github.com/flox1an/nostube/tree/main/skills#manual-installation).

## Use

Give the agent a local file or an existing media URL, and ask for preparation first:

> Use nostr-video-publisher to prepare ./my-video.mp4 for Nostr. Show me the metadata, thumbnail, upload destinations and event before publishing. Do not upload or publish until I approve.

Depending on the task, the agent needs [nak](https://github.com/fiatjaf/nak) for Nostr operations, `ffmpeg`/`ffprobe` for inspecting and converting media, and optionally `yt-dlp` for imports. These tools are installed separately.

Before an upload or publication, choose:

- **Identity and signer:** the Nostr identity to publish as and an authorized signing method. Never paste private keys or session credentials into chat; use a protected environment/file or signer connection.
- **Write relays:** at least one relay that accepts your events. The agent looks up the identity's NIP-65 relay list on the indexer relays `purplepag.es` and `index.hzrd149.com`; read-only entries are not publishing destinations. Without a list, it offers `relay.nostu.be`, `relay.primal.net` and `nos.lol` and publishes only to the ones you pick.
- **Blossom hosting:** a server that accepts uploads under your identity, for any new media, thumbnails or subtitles. Existing hosted media can be referenced without uploading it again.

Offline preparation needs no publishing endpoints. Approve public uploads and publication deliberately. The skill requires verified upload results, relay acknowledgements and event read-back before reporting success; discovering a server does not prove permission to use it.

Read the [skill and its references](https://github.com/flox1an/nostube/tree/main/skills/nostr-video-publisher) for event examples, ffmpeg recipes and the full publishing workflow. For browser-based publishing instead, see [Uploads and transcoding](/media/uploads) or the [Studio](/server/studio).
