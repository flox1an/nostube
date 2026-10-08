# Port the relay into nostube-server instead of embedding nostr-rs-relay

The package needs its own Nostr relay. `nostr-rs-relay` is upstream code (scsibug, MIT) with its own Tokio runtime and listener, global signal handling, a `process::exit` path, and hyper 0.14 / nostr 0.18. Embedding it unchanged would need a fork, an upstream PR, or a bundled helper process. We port the parts we need into `nostube-server` and modernize them, so the package stays one self-contained project with no fork and no extra process.

This deliberately deviates from spec v1, which said rewriting a relay would be no shortcut (§ Empfehlung) and that the package copies no adapted source trees (§3). Almond is different: it is our own project, so it gets changed to also work as a library and stays a pinned dependency.
