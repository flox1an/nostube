# Issue tracker: Forgejo

Issues and specs for this repo live as Forgejo issues at https://forgejo.example.ts.net/flox/nostube-server. Use the `tea` CLI for all operations.

Always pass `--login forgejo --repo flox/nostube-server` (abbreviated below as `$R`); `forgejo` is not the default tea login.

## Conventions

- **Create an issue**: `tea issues create $R --title "..." --description "..."`. For multi-line bodies use `--description-file -` with a heredoc. Add labels with `--labels a,b`.
- **Read an issue**: `tea issues $R <number> --comments`, or `tea issues list $R --state all --fields index,title,body,labels,comments --output json` for structured output.
- **List issues**: `tea issues list $R --state open --fields index,title,body,labels --output json`, filtered with `--labels` and `--state`.
- **Comment on an issue**: `tea comment $R <number> "..."`
- **Apply / remove labels**: `tea issues edit $R <number> --add-labels "..."` / `--remove-labels "..."`. A label must exist first: `tea labels list $R`; create it with `tea labels create $R --name ... --color ...`.
- **Close**: `tea comment $R <number> "..."` then `tea issues close $R <number>`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues:

- **Read a PR**: `tea pulls $R <number>`; diff via `tea api $R repos/{owner}/{repo}/pulls/<number>.diff`.
- **List PRs for triage**: `tea pulls list $R --state open --output json`, keeping only authors other than `flox`.
- **Comment / label / close**: `tea comment`, `tea issues edit --add-labels`/`--remove-labels` (Forgejo PRs share the issue label API), `tea pulls close`.

Forgejo shares one number space across issues and PRs, so a bare `#42` may be either: try `tea pulls $R 42`, then fall back to `tea issues $R 42`.

## When a skill says "publish to the issue tracker"

Create a Forgejo issue.

## When a skill says "fetch the relevant ticket"

Run `tea issues $R <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `Part of #<map>` at the top of the body, listed in a task list in the map body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: Forgejo native issue dependencies: `tea api $R -X POST repos/{owner}/{repo}/issues/<child>/dependencies -f owner=flox -f repo=nostube-server -F index=<blocker>`; read via `tea api $R repos/{owner}/{repo}/issues/<child>/dependencies`. Also mirror as a `Blocked by: #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: the map's open children with no open blocker and no assignee; first in map order wins.
- **Claim**: `echo '{"assignees":["flox"]}' > /tmp/a.json && tea api $R -X PATCH 'repos/{owner}/{repo}/issues/<n>' -d @/tmp/a.json`, the session's first write. (`tea issues edit --add-assignees` 404s on this Forgejo.)
- **Resolve**: comment the answer, close, then append a context pointer (gist + link) to the map's Decisions-so-far.
