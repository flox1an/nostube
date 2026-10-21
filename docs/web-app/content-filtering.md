# Content filtering

Nostr has no central moderation: anyone can publish a video, and creators label their own content, or don't. The web app therefore filters in two independent layers:

| Layer | Decides on | Based on | Default |
|---|---|---|---|
| **NSFW filter** | Sensitive content (nudity, sexual or violent material) | The creator's `content-warning` tag and the selected moderation preset | Hide |
| **Trust filter** | Spam and unknown accounts | Trust scores computed from the Nostr network | On |

A video has to pass both. Your own mutes come on top.

## NSFW filter

### Where the label comes from

A video counts as NSFW if any of these is true:

1. **The creator labelled it.** The event carries a `content-warning` tag ([NIP-36](https://github.com/nostr-protocol/nips/blob/master/36.md)). The upload page and the Studio set it with the content warning switch. This is the intended way, but many accounts never set it.
2. **The moderation preset lists the account as NSFW.** Then every video of the account is treated as NSFW, labelled or not (see [Moderation presets](#moderation-presets)).
3. **It comes from a known adult platform.** Videos imported from a few adult sites, recognised by their `d`, `source` or `client` tag, are flagged automatically.

### Settings → Content

| Mode | Effect |
|---|---|
| **Hide** (default) | NSFW videos are left out of grids, playlists and suggestions. Profile and video pages of accounts on the preset's NSFW list show a generic "content hidden" screen. |
| **Warning** | NSFW videos appear with a blurred thumbnail and a warning; they play only after a click. |
| **Show** | NSFW videos appear and play like any other. |

Switching away from **Hide** asks you to confirm that you are 18 or older; without that confirmation the app treats the setting as **Hide**. The embed player refuses NSFW videos to viewers who have not opted in. Operators of their own web app build can turn both off with `VITE_NSFW_SAFETY=off` (see [Configuration](/web-app/#configuration)).

## Moderation presets

A preset is a moderation list that someone publishes as a Nostr event (kind `30078`, `d` tag `nostube-presets`). Viewers pick one under **Settings → Presets**; without a choice the app uses the Nostube default preset. A preset holds:

| List | Effect |
|---|---|
| NSFW accounts | All their videos count as NSFW and follow your NSFW setting. |
| Blocked accounts | Hidden everywhere, regardless of settings; their profile and video pages show the "content hidden" screen. |
| Blocked videos | Left out of playlists and refused by the embed player. |
| Default relays, default Blossom proxy | What the **Reset** buttons under **Settings → Network** restore. |

The preset is a safety net for creators who don't label their content: one entry covers the whole account, including videos published later.

Accounts you reported as illegal are blocked like preset-blocked accounts (see [Your own filters](#your-own-filters)). Reports by other people never block anything.

## Trust filter

Trust scores come from Relatr, a trust service that the app queries over Nostr ([ContextVM](https://contextvm.org)). Each account gets two scores between 0 and 1:

- **Personal score**: how close the account is to you in the follow graph, plus public activity signals. Signed in with a private key, the app asks from your key's point of view. Logged out or with a browser extension or remote signer, it uses a random key for the browser session, so the score is not personalised.
- **Global score**: the average of Nostube's video indicators (creator activity, viewer engagement, creator comments).

An author passes the filter when the personal score is at least **40 %** and the global score at least **20 %**. You and the authors you follow (your media follow list, kind `10020`) always pass. Authors without scores yet are hidden; that is why new accounts may not show up at first.

The filter is on by default on the home page, Shorts, category and tag pages; the shield button next to the feed switches it. Turning it off shows a warning the first time. Suggestions next to a video are always filtered, whether they come from the search service or from relays. Search, Subscriptions, profile pages and direct links are not filtered by trust.

The shield next to an author's name shows their trust level; click it for the scores.

## Your own filters

- **Mutes** hide an account's videos and comments from feeds, suggestions and comment threads. A profile you open on purpose still shows.
- **Reports** (the report button on videos and comments) publish a [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) report. If you report an account as illegal, it is blocked in your app. Reports by other accounts have no effect.

## Nostube Server instances

A creator site of a [Nostube Server](/server/) only shows its own creators. It uses no preset and no trust filter; the NSFW setting still applies to viewers.
