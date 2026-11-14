#!/usr/bin/env node
// Pairs nak with a NIP-46 remote signer (Amber, nsec.app, ...) via a nostrconnect:// QR code
// shown in the terminal (and optionally a desktop window), then writes a nak env file with
// NOSTR_SECRET_KEY (bunker URL incl. secret) and NOSTR_CLIENT_KEY (the client key the signer
// authorized). Never prints either.
//
// Usage: node nostrconnect-pair.mjs [--relay wss://…]… [--name NAME] [--timeout SECONDS]
//                                   [--out FILE] [--force] [--perms a,b,…] [--window]
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, hostname, tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { createNostrConnectURI } from 'nostr-tools/nip46'
import * as nip44 from 'nostr-tools/nip44'
import { SimplePool } from 'nostr-tools/pool'
import QRCode from 'qrcode'

const { values: args } = parseArgs({
  options: {
    // Only relays verified to carry kind 24133. Each one is probed before pairing: nak waits for
    // every relay in the bunker URL, so a single dead entry makes signing hang. relay.nsec.app,
    // relay.nip46.com (DNS gone) and nos.lol failed in practice.
    relay: { type: 'string', multiple: true, default: ['wss://relay.primal.net', 'wss://nostr.oxtr.dev'] },
    name: { type: 'string', default: defaultName() },
    // Kind-scoped: Amber silently drops a bare `sign_event` permission.
    perms: {
      type: 'string',
      default: 'get_public_key,sign_event:1,sign_event:22242,sign_event:24242,sign_event:34235,sign_event:34236',
    },
    // Error correction: L makes the QR one or two versions smaller than the library's default M.
    // The code is shown on a clean screen, so the lower redundancy is enough and width matters more.
    ec: { type: 'string', default: 'L' },
    // Drop perms and name from the URI: the code gets much smaller, but the signer asks for each
    // signature and shows no app name.
    compact: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '300' },
    out: { type: 'string', default: join(homedir(), '.config/nak/signer.env') },
    force: { type: 'boolean', default: false },
    window: { type: 'boolean', default: false },
  },
})

// "nak-<user>@<host>" so the signer's app list shows who paired from which machine. Amber
// mis-parses names containing spaces, `+`, `&` or `=`, so anything outside [A-Za-z0-9._@-]
// becomes "-". macOS hostnames are often random (DHCP); its LocalHostName is the readable one.
function defaultName() {
  const mac = process.platform === 'darwin' && spawnSync('scutil', ['--get', 'LocalHostName'], { encoding: 'utf8' })
  const host = (mac?.status === 0 && mac.stdout.trim()) || hostname().split('.')[0]
  return `nak-${userInfo().username}@${host}`.replace(/[^A-Za-z0-9._@-]/g, '-')
}

const fail = msg => {
  console.error(`error: ${msg}`)
  process.exit(1)
}
if (existsSync(args.out) && !args.force) fail(`${args.out} exists; pass --force to replace it`)
const timeoutMs = Number(args.timeout) * 1000
if (!(timeoutMs > 0)) fail('--timeout must be a positive number of seconds')
const ec = args.ec.toUpperCase()
if (!['L', 'M', 'Q', 'H'].includes(ec)) fail('--ec must be one of L, M, Q, H')

// Drop relays that do not answer: a dead entry in the bunker URL hangs every later signing call,
// because nak waits for all of them before sending.
async function reachable(urls) {
  const probe = new SimplePool()
  const ok = await Promise.all(
    urls.map(async url => {
      const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      try {
        await Promise.race([probe.ensureRelay(url), timer])
        return true
      } catch (error) {
        console.warn(`skipping ${url}: ${error?.message || 'not reachable'}`)
        return false
      }
    })
  )
  probe.close(urls)
  return urls.filter((_, i) => ok[i])
}
const relays = await reachable(args.relay.map(r => (r.includes('://') ? r : `wss://${r}`)))
if (!relays.length) fail('no relay answered; pass --relay with a working NIP-46 relay')

const clientSk = generateSecretKey()
const clientPk = getPublicKey(clientSk)
const secret = randomBytes(16).toString('hex')
const uri = createNostrConnectURI({
  clientPubkey: clientPk,
  relays,
  secret,
  perms: args.compact ? undefined : args.perms.split(',').filter(Boolean),
  name: args.compact ? undefined : args.name.replace(/[^A-Za-z0-9._@-]/g, '-'),
})

// Desktop window: a viewer process we own, so killing it closes the window. The PNG holds the
// one-time pairing secret; it lives in a private temp dir removed on exit.
async function openWindow() {
  const viewers = {
    darwin: [['qlmanage', '-p']],
    linux: [['feh', '--title', 'nostrconnect'], ['eog'], ['display']],
  }[process.platform] ?? []
  const viewer = viewers.find(([cmd]) => spawnSync('which', [cmd]).status === 0)
  if (!viewer) return console.warn('No QR window viewer found (macOS: qlmanage; Linux: feh, eog or display); use the terminal QR.')
  const dir = mkdtempSync(join(tmpdir(), 'nostrconnect-'))
  const png = join(dir, 'nostrconnect-qr.png')
  await QRCode.toFile(png, uri, { width: 480, margin: 4, errorCorrectionLevel: ec })
  chmodSync(png, 0o600)
  const child = spawn(viewer[0], [...viewer.slice(1), png], { stdio: 'ignore' })
  process.on('exit', () => {
    child.kill()
    rmSync(dir, { recursive: true, force: true })
  })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130))

// Arm the subscription before showing the QR: replies are ephemeral (kind 24133) and a fast
// phone answers within a second. `since` reaches back because Amber stamps replies ahead.
const pool = new SimplePool()
const conversationKey = signerPk => nip44.getConversationKey(clientSk, signerPk)
const sub = pool.subscribe(
  relays,
  { kinds: [24133], '#p': [clientPk], since: Math.floor(Date.now() / 1000) - 60 },
  {
    onevent(event) {
      let message
      try {
        message = JSON.parse(nip44.decrypt(event.content, conversationKey(event.pubkey)))
      } catch {
        return // not for us or not NIP-44; keep waiting
      }
      if (message.error) console.error(`signer error: ${message.error}`)
      // Only the echoed secret proves the reply comes from whoever scanned the QR. A bare "ack"
      // proves nothing (the client pubkey is public in the QR), so it is never accepted.
      // Legacy signers send a `connect` request carrying the secret instead of a response.
      const echoed = message.result === secret || (message.method === 'connect' && message.params?.[1] === secret)
      if (message.result === 'ack') console.warn('ignored a bare "ack": the signer did not echo the pairing secret')
      if (echoed) save(event.pubkey)
    },
  }
)

console.log('Scan with your signer (Amber: "+" > scan; nsec.app: "Connect app" > paste):\n')

// Half blocks: one character per module across, half a module down, so modules stay square — the
// narrowest faithful terminal rendering (quadrant blocks would halve the width but stretch each
// module 2:1, which scanners reject). Rendered by hand because qrcode's terminal renderer ignores
// `margin` and pads one module only, and its trailing spaces get trimmed by terminal panes, which
// eats the right quiet zone. Quiet zone cells are non-breaking spaces so they survive trimming;
// black on white keeps the code scannable on a dark terminal.
function qrLines(quiet = 2) {
  const { modules } = QRCode.create(uri, { errorCorrectionLevel: ec })
  const size = modules.size
  const inCode = (row, col) => row >= 0 && row < size && col >= 0 && col < size && modules.get(row, col)
  const lines = []
  for (let row = -quiet; row < size + quiet; row += 2) {
    let line = ''
    for (let col = -quiet; col < size + quiet; col++) {
      const top = inCode(row, col)
      const bottom = inCode(row + 1, col)
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
    }
    lines.push(`\x1b[47m\x1b[30m${line.replace(/ +$/, run => '\u00a0'.repeat(run.length))}\x1b[0m`)
  }
  return lines
}

async function printQr() {
  const lines = qrLines()
  const cols = Math.max(...lines.map(line => [...line.replace(/\x1b\[[0-9;]*m/g, '')].length))
  console.log(lines.join('\n'))
  const width = process.stdout.columns
  if (width && cols > width)
    console.log(`QR needs ${cols} columns, this terminal has ${width}: rerun with --compact, or widen it.\n`)
}
await printQr()
console.log(`Or paste this URI into the signer:\n${uri}\n`)
if (args.window) await openWindow()
console.log(`Waiting up to ${args.timeout}s on ${relays.join(', ')} …`)

function save(signerPk) {
  sub.close()
  // No secret= in the saved URL: the signer created the session when it answered the pairing, and
  // Amber rejects a later `connect` that carries a secret ("We don't accept connect requests with
  // new secret"). The client key alone identifies the session.
  const query = relays.map(r => `relay=${encodeURIComponent(r)}`).join('&')
  const env =
    `NOSTR_SECRET_KEY='bunker://${signerPk}?${query}'\n` +
    `NOSTR_CLIENT_KEY=${Buffer.from(clientSk).toString('hex')}\n`
  mkdirSync(dirname(args.out), { recursive: true, mode: 0o700 })
  const tmp = `${args.out}.tmp-${process.pid}`
  writeFileSync(tmp, env, { mode: 0o600 })
  chmodSync(tmp, 0o600)
  renameSync(tmp, args.out)
  console.log(`Paired with signer ${signerPk}\nWrote ${args.out} (mode 600)`)
  pool.close(relays)
  process.exit(0)
}

setTimeout(() => {
  console.error('error: timed out waiting for the signer; nothing was written')
  process.exit(2)
}, timeoutMs)
