# TLS modes: proxy, files, local-ca; one canonical origin

Instances run on hosts and networks we don't know in advance (Mac, Linux Docker, NAS, VPS; with or without a domain, Tailscale, or a router that takes DNS entries), so TLS is not tied to one environment. The instance has one setting, the TLS mode, with four values: `proxy` (TLS terminated upstream; forwarded headers trusted only from configured `trusted_proxies`, default loopback), `files` (PEM cert + key, hot-reloaded on change; renewal belongs to the operator's tool, e.g. certbot or `tailscale cert`), `local-ca` (the instance runs its own private CA), and `acme` (built-in public CA). The first cut ships `proxy`, `files` and `local-ca`; `acme` stays in the model but is a later effort. The offline acceptance test runs in `local-ca`, the only mode with no offline time limit and no external account; `files` with a `tailscale cert` certificate gets a smoke test.

`local-ca`: a name-constrained root (permitted: `.local`, `.home.arpa`, `.lan`, 10/8, 172.16/12, 192.168/16, fd00::/8; 10 years) signs one leaf (1 year, renewed offline at ⅔ and immediately on name/IP change) whose SANs carry the host's existing `.local` name, an optional router DNS name, and the LAN IP(s). The instance runs no mDNS responder of its own. Only in this mode, port 80 serves `/ca` (CA cert, iOS profile, per-OS instructions, fingerprint) and redirects everything else to HTTPS; the other modes have no port 80 listener.

Each instance has exactly one canonical origin, chosen at setup. Only it goes into the public config and into URLs inside published Nostr events; other names are access aliases. Changing it is a hostname transition, never a silent switch.

## Considered Options

- **Tailscale `*.ts.net` as the strategy**: rejected as a product premise. It only fits hosts already on Tailscale; it remains possible through `files`.
- **Built-in ACME in the first cut**: deferred. TLS-ALPN-01/HTTP-01 needs a publicly reachable host, which is the external profile. DNS-01 needs per-provider code or acme-dns delegation. certbot/lego + `files` covers it until then.
- **Public CA only**: impossible for `.local`, `.home.arpa`/`.lan` and RFC1918 IPs, and bounded offline by the certificate lifetime.
- **Narrow name constraints** (exactly the instance's names): rejected; every name or IP change would force re-trusting the CA on every device.

## Consequences

`local-ca` viewers need a one-time CA trust step per device (iOS: profile plus the full-trust toggle; Firefox on Linux: manual import), and guest devices only work with a public name (`files` + split DNS). Since `.local` and bare-IP aliases are each a single host name, URLs on those aliases cannot rely on subdomains.

## Addendum: the `proxy` mode as built

`proxy` is implemented as `[tls] mode = "proxy"` with a `port` (default 8080): plain HTTP, no CA, no certificate files, no port-80 onboarding. The canonical origin is given at the first start (`--origin` or `NOSTUBE_ORIGIN`); an origin implies this mode, and a first start in proxy mode without one stops with a message. `trusted_proxies` is **not** built: the server reads no forwarded headers (the origin comes from the config, the proxy must pass `Host` on), so there is no setting to trust them with. It returns when something needs the client address. To keep plain HTTP from being reachable by accident, the binary binds loopback by default in this mode; the container image sets `NOSTUBE_BIND=0.0.0.0` because it is only reached over the container network. See `docs/deploy.md`.
