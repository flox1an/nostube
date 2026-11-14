---
name: nak-remote-signer
description: 'Pair nak with a NIP-46 remote signer over Nostr Connect (nostrconnect:// QR: Amber, nsec.app, nsecBunker) and call nak so no key is stored locally. Use whenever nak must sign (event, blossom, publish) and no signer is set up yet, when its signing hangs, or when the user asks to connect nak to a remote signer or bunker.'
---

# nak Remote Signer

Prerequisite for every signing nak command. Other skills: run [Resolve the signer](#1-resolve-the-signer) first, then call nak as in [Calling nak](#3-calling-nak).

## How nak finds its signer

- `NOSTR_SECRET_KEY` (or `--sec`): nsec/hex, `ncryptsec`, or a `bunker://…` URL. Unset means nak signs with its machine-default key (`nak key default`): never sign or publish with that by accident.
- `NOSTR_CLIENT_KEY` (or hidden `--connect-as`): the key nak uses to talk to a bunker. The bunker authorizes this key, so it must stay stable. Unset means the machine-default key.
- nak reads no config file for either. This skill stores both in **`~/.config/nak/signer.env`** (mode 600) and loads it with `set -a; . ~/.config/nak/signer.env; set +a`. The file location is this skill's convention, not a nak standard.

Never print, log or pass either value as a command-line argument: the bunker URL contains a secret and the client key is authorized to request signatures.

## 1. Resolve the signer

Check in this order and stop at the first match (prints only the source, never values):

```bash
if [ -n "$NOSTR_SECRET_KEY" ]; then echo "env: user-configured signer"
elif [ -f ~/.config/nak/signer.env ]; then echo "file: ~/.config/nak/signer.env"
else echo "none"; fi
```

| Result | Action                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env`  | The user configured nak themselves (nsec, ncryptsec or their own bunker). Use it as is: no remote-signer setup, do not load or overwrite the env file. |
| `file` | Use the file (step 3). If it is not mode 600, fix with `chmod 600`.                                                                                    |
| `none` | Prerequisite: run [Pair via QR code](#2-pair-via-qr-code), then resolve again. Do not sign before a signer exists.                                     |

Then confirm the identity once per session: sign without a relay argument (nothing is published) and compare with the intended `npub` (`nak decode npub1…`):

```bash
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak event -k 1 -c 'signer check' ) | jq -r .pubkey
```

Mismatch, error, or no answer within ~60 s: stop and see [Troubleshooting](#troubleshooting).

## 2. Pair via QR code

Requires Node.js 22+. Install the script dependencies once, then run it where the user sees the output (the QR is printed there):

```bash
dir=<this skill>/scripts
npm install --prefix "$dir" --no-audit --no-fund
node "$dir/nostrconnect-pair.mjs"
```

Options: `--window` (desktop only, opt-in: also shows the QR in a window that closes automatically once paired or timed out; macOS uses `qlmanage`, Linux `feh`/`eog`/`display`; use it in agent harnesses such as OMP, whose terminal collapses long output to a 10-line preview and a narrow pane wraps the QR past recognition), `--relay wss://…` (repeatable, default `wss://relay.primal.net` and `wss://nostr.oxtr.dev`; every relay is probed first and unreachable ones are dropped with a warning, because nak waits for every relay in the bunker URL and one dead entry makes signing hang), `--ec L|M|Q|H` (error correction, default `L`: it is the smallest code version and the screen is clean), `--compact` (omit `perms` and `name` from the URI: the QR drops to 53 columns instead of 69, but the signer then prompts for every signature and shows no app name), `--timeout 300` (seconds), `--out FILE`, `--force` (replace an existing file), `--perms` (requested permissions, kind-scoped `sign_event:<kind>`: Amber drops a bare `sign_event`), `--name` (app name shown in the signer; default `nak-<user>@<host>`, e.g. `nak-alice@macbook`, so the user can tell which account and machine paired; characters outside `A-Za-z0-9._@-` become `-` because Amber mis-parses spaces, `+`, `&` and `=`).

Terminal QR size: rendered by hand as half blocks, one character per module across and one per two modules down, which keeps modules square and is the narrowest faithful rendering — quadrant blocks (`▘▝▖▗`) would halve the width but stretch every module 2:1, which scanners reject. The quiet zone is two modules and made of non-breaking spaces: terminal panes trim trailing blanks, which otherwise eats the right margin and leaves an unscannable code. Width is therefore set by the data: 69 columns with perms and name, 53 with `--compact`. When the QR is wider than the terminal the script prints the column count and the `--compact` hint instead of letting the code wrap. `node scripts/verify-qr.mjs <nostrconnect-uri>` rasterizes the same block grid and decodes it with `zbarimg`, which is how the rendering is checked without a phone.

Tell the user to:

1. Scan the QR code in the signer (Amber: "+", then scan) or paste the printed `nostrconnect://` URI (nsec.app, desktop signers).
2. Choose the intended account and approve. Manual approval shows a prompt for every signature; auto approval signs silently.

The script waits for the signer's answer, accepts it only if it echoes the pairing secret, and writes `NOSTR_SECRET_KEY='bunker://<signer>?relay=…'` plus `NOSTR_CLIENT_KEY` atomically with mode 600. The pairing secret is deliberately left out of the saved URL: answering the `nostrconnect://` code already created the session, and Amber rejects a later `connect` that carries a secret. On timeout it writes nothing. Then resolve again (step 1).

**Signer shows a `bunker://` URL instead:** have the user write the file in their own terminal so the secret never reaches the agent: `umask 077; mkdir -p ~/.config/nak; read -rs -p 'bunker URL: ' v; printf "NOSTR_SECRET_KEY='%s'\nNOSTR_CLIENT_KEY=%s\n" "$v" "$(nak key generate)" > ~/.config/nak/signer.env; unset v`.

## 3. Calling nak

Agent shells usually do not keep environment variables between commands, so load the signer in the same command as every signing nak call. Run nak in a subshell so the variables never leak into the rest of the session, and keep a user-configured `NOSTR_SECRET_KEY` untouched:

```bash
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak <command> … )
```

Common signing calls (the signer may prompt; each needs approval or an auto-approve permission for its kind):

```bash
# sign and publish exact event JSON (avoid shell tag flags for multi-value tags)
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak event wss://relay.one wss://relay.two < event.json )
# sign only, publish nothing (omit relays); write the result for review
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak event < event.json > signed.json )
# Blossom upload: one kind 24242 authorization per request
( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; nak blossom --server blossom.example upload video.mp4 )
```

- A pre-signed event is published unchanged (`nak event wss://relay < signed.json`); nak does not re-sign unless `--force-sign`.
- Reading (`nak req`, `nak fetch`) needs no signer, except relays that demand NIP-42 AUTH (`--auth`).
- Suggest the user allows the kinds a workflow signs (for example `24242` for uploads) for this app in the signer; otherwise expect one prompt per signature.
- Users who want this outside agents can add the same subshell as a shell function, e.g. `nak() ( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; command nak "$@" )`.

## 4. Tell the user how to sign from now on

Finish a setup by handing the user their own commands, not just a confirmation. Report the signer's `npub` (`nak encode npub <pubkey>`, or the answer of the identity check) and the file the setup wrote, then give them these two options:

```bash
# per shell session: load the signer once, then call nak normally
set -a; . ~/.config/nak/signer.env; set +a
nak event wss://relay.example < event.json
```

```bash
# once, in ~/.zshrc or ~/.bashrc: every nak call loads it by itself
nak() ( [ -n "$NOSTR_SECRET_KEY" ] || { set -a; . ~/.config/nak/signer.env; set +a; }; command nak "$@" )
```

With either one, the commands are the plain ones — the signer prompts or auto-approves per its permission level:

```bash
nak event wss://relay.example < event.json   # sign and publish exact JSON
nak event < event.json                       # sign only, nothing published
nak blossom --server blossom.example upload video.mp4
nak req -k 1 -a <pubkey> wss://relay.example # reading needs no signer
```

Say that the variables must be loaded in the shell that runs nak (`NOSTR_SECRET_KEY` and `NOSTR_CLIENT_KEY` together, from the file), that signing then happens in the remote signer, and that the signer's per-app permissions decide between silent signing and one prompt per event.

## Troubleshooting

- **Signing hangs, no prompt in the signer:** check, in order:
  - Amber drops all NIP-46 requests while its Android notification permission is off, and rejects requests whose `created_at` is more than 5 minutes off its clock.
  - A listed relay is dead, its DNS record is gone (`relay.nip46.com`) or it does not relay kind 24133 (`relay.nsec.app` and `nos.lol` failed in practice). nak's NIP-46 client waits for every listed relay, so one bad relay can hang it: edit the bunker URL down to relays that work, or re-pair with `--relay`.
- **Signatures arrive but the user never sees a prompt:** either the signer auto-approves (check its permission level for this app), or another signer holding the same key answered (the signer pubkey in the URL differs from the one the user expects). Revoke stale sessions in every signer and re-pair.
- **Pubkey mismatch:** the wrong account was chosen in the signer, or a user-set `NOSTR_SECRET_KEY` points at another identity. Ask the user which to use; re-pair only with their consent.
- **`connect` rejected after re-pairing:** the client key changed. Re-pair; never edit one variable without the other.
- **`response error: We don't accept connect requests with new secret` (Amber):** the saved bunker URL still carries `secret=` from the pairing. Answering the `nostrconnect://` code already created the session, so a later `connect` with the secret is rejected: remove the `&secret=…` from `NOSTR_SECRET_KEY`. The pairing script writes the URL without it for this reason.
