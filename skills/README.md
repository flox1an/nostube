# Agent Skills

Reusable instructions for AI agents, distributed independently of Nostube's apps.
Installing a skill adds instructions to your agent; it does not install tools,
create Nostr keys, upload media, or publish events.

## Available skills

- [Nostr Video Publisher](nostr-video-publisher/SKILL.md): prepare media, upload
  videos and thumbnails to Blossom, and sign and publish NIP-71 video events.
  Includes event examples, ffmpeg recipes, and Nostr/Blossom references. Works
  outside this repository; a Nostube server is optional.

## Install with the skills CLI

Requires Node.js and npm; see the [skills CLI requirements](https://github.com/vercel-labs/skills#install-a-skill).
Run from the project where you want the skill available:

```bash
npx skills add flox1an/nostube --skill nostr-video-publisher
```

Choose your agent in the installer (for example Claude Code, Codex, or OpenCode).
The `--skill` option selects only this skill, not the repository's internal skills.
For installation across projects, add `-g`:

```bash
npx skills add flox1an/nostube --skill nostr-video-publisher -g
```

Select an agent explicitly with `-a claude-code` or `-a codex`. Inspect installed
skills with `npx skills list`; check and update with `npx skills check` and
`npx skills update`. Full options: [CLI documentation](https://github.com/vercel-labs/skills).

## Manual installation

Download or clone this repository, then copy the **whole**
`skills/nostr-video-publisher/` directory, including `references/`, into your agent's
skill directory. For example, from a local checkout:

```bash
# Claude Code, available across projects
mkdir -p ~/.claude/skills
cp -R skills/nostr-video-publisher ~/.claude/skills/

# Codex / agents using the shared personal skills directory (alternative)
mkdir -p ~/.agents/skills
cp -R skills/nostr-video-publisher ~/.agents/skills/
```

Use `.claude/skills/` or `.agents/skills/` inside a project for project-local
installation. Check your agent's documentation for supported directories and
whether it needs a restart to discover new skills. Copying `SKILL.md` alone omits
required references. This directory is the distribution source; it is not linked
back into Nostube's internal `.agents/skills/`.

## Use

Ask your agent, for example:

> Use nostr-video-publisher to prepare this video for Nostr. Show me the metadata,
> thumbnail, upload destinations, and event before publishing.

The skill is instructions only. Depending on the task, the agent needs
[nak](https://github.com/fiatjaf/nak) for Nostr operations, ffmpeg/ffprobe for media
inspection and conversion, and optionally yt-dlp for imports.

Before publishing, resolve:

- **Identity and signer:** an explicitly chosen Nostr identity and authorized
  signing method. The skill does not silently create a key.
- **At least one write relay:** a relay willing to accept the event. Read-only
  NIP-65 relay entries are not publishing destinations.
- **Blossom hosting, when needed:** a server that accepts uploads under your
  identity for new files, thumbnails, or subtitles. Existing hosted media can be
  referenced without a new upload; mirroring is optional.

The agent first uses your request and existing configuration, then can discover
NIP-65 write relays and BUD-03 Blossom servers for the chosen identity through an
available lookup source. It asks for unresolved choices together and offers
discovered candidates, with permission/availability caveats. No provider is
silently selected. Offline preparation needs none of these publishing endpoints.

Supply keys or session credentials through a protected environment or file, not
chat. Inspect instructions before installing; authorize public uploads and
publication deliberately. Preliminary probes do not guarantee acceptance; success
requires verified upload results and relay acknowledgements.

The event reference distinguishes NIP-71 rules from Nostube-specific conventions
and its legacy subtitle format. The skill is covered by the repository's
[MIT license](../LICENSE).
