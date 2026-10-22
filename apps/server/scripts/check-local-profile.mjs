#!/usr/bin/env node
// Scoped traffic check (ADR 0008, 0012): seeds a creator video only on a throwaway private-reach
// instance's relay and Blossom, then opens the signed-in site, video page and embed in Chromium.
// Public sockets on the site may query only the seeded visitor's kinds 0/10002 (mandatory in
// both reaches); external HTTP, public writes, public video queries and all external embed
// traffic fail. Public reach cannot run here: a local-ca `.local` instance cannot be public.
//
//   node apps/server/scripts/check-local-profile.mjs [--server <binary>] [--browser <path>]
//     [--default-profile-relays] [--port 9443] [--wait 10] [--serve]
//
// macOS (the local-ca mode names the instance after `scutil --get LocalHostName`). Build the
// web assets and the server first (scripts/build-server-web.sh, cargo build).
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import WebSocket from 'ws'
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'

const { values: opt } = parseArgs({
  options: {
    server: {
      type: 'string',
      default: new URL('../target/debug/nostube-server', import.meta.url).pathname,
    },
    browser: {
      type: 'string',
      default: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    },
    port: { type: 'string', default: '9443' },
    wait: { type: 'string', default: '10' },
    // Compare an omitted list with `[]`; both retain mandatory public identity lookup.
    'default-profile-relays': { type: 'boolean', default: false },
    // Only seed and keep the instance running, for a look with another browser.
    serve: { type: 'boolean', default: false },
  },
})
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0' // the instance's own local CA
const host = `${execFileSync('scutil', ['--get', 'LocalHostName']).toString().trim().toLowerCase()}.local`
const origin = `https://${host}:${opt.port}`
const relay = `wss://${host}:${opt.port}`
const data = mkdtempSync(join(tmpdir(), 'nostube-local-'))
const profileDir = mkdtempSync(join(tmpdir(), 'nostube-local-browser-'))
const creatorKey = generateSecretKey()
const creator = getPublicKey(creatorKey)
const visitorKey = generateSecretKey()
const visitor = getPublicKey(visitorKey)

writeFileSync(
  join(data, 'config.toml'),
  `revision = 1
origin = "${origin}"
title = "Local check"
reach = "private"
creators = ["${creator}"]
allowed_writers = ["${creator}"]
video_sources = ["${relay}"]
interaction_relays = ["${relay}"]
${opt['default-profile-relays'] ? '' : 'profile_relays = []\n'}search = { mode = "off" }
tls = { mode = "local-ca", https_port = ${opt.port}, http_port = 0 }
storage = { free_space_reserve_gib = 0 }
`
)

const children = []
const cleanup = () => {
  for (const child of children) child.kill('SIGKILL')
  rmSync(data, { recursive: true, force: true })
  rmSync(profileDir, { recursive: true, force: true })
}
process.on('exit', cleanup)
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
])
  process.on(signal, () => process.exit(code))

const server = spawn(opt.server, ['--data', data, '--bind', '127.0.0.1'], {
  stdio: ['ignore', 'ignore', 'pipe'],
})
children.push(server)
let serverLog = ''
server.stderr.on('data', chunk => (serverLog += chunk))
server.on('exit', code => code && console.error(`server exited ${code}:\n${serverLog}`))

// The instance resolves through mDNS; fetch it at 127.0.0.1 with the instance's Host header.
const local = (path, init = {}) =>
  fetch(`https://127.0.0.1:${opt.port}${path}`, {
    ...init,
    headers: { Host: `${host}:${opt.port}`, ...init.headers },
  })

for (let i = 0; ; i++) {
  try {
    if ((await local('/api/config')).ok) break
  } catch {
    // not up yet
  }
  if (i > 100) throw new Error(`server did not start:\n${serverLog}`)
  await sleep(200)
}

async function upload(bytes, type) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const auth = finalizeEvent(
    {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      content: 'Upload',
      tags: [
        ['t', 'upload'],
        ['x', sha256],
        ['expiration', String(Math.floor(Date.now() / 1000) + 600)],
      ],
    },
    creatorKey
  )
  const res = await local('/upload', {
    method: 'PUT',
    headers: {
      Authorization: `Nostr ${Buffer.from(JSON.stringify(auth)).toString('base64')}`,
      'Content-Type': type,
      'X-SHA-256': sha256,
    },
    body: bytes,
  })
  if (!res.ok) throw new Error(`upload answered ${res.status}: ${await res.text()}`)
  return { sha256, url: `${origin}/${sha256}${type === 'image/png' ? '.png' : '.mp4'}` }
}

async function publish(events) {
  const ws = new WebSocket(`wss://127.0.0.1:${opt.port}`, {
    headers: { Host: `${host}:${opt.port}` },
    rejectUnauthorized: false,
  })
  await new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject))
  for (const event of events) {
    ws.send(JSON.stringify(['EVENT', event]))
    const [, , ok, message] = await new Promise(resolve =>
      ws.once('message', m => resolve(JSON.parse(m)))
    )
    if (!ok) throw new Error(`relay refused kind ${event.kind}: ${message}`)
  }
  ws.close()
}

// 1×1 PNG; the video bytes only need to be served, not to decode.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
const picture = await upload(png, 'image/png')
const video = await upload(Buffer.concat([Buffer.from('local-check'), randomTail()]), 'video/mp4')
function randomTail() {
  return createHash('sha256').update(String(Math.random())).digest()
}
const now = Math.floor(Date.now() / 1000)
const sign = template =>
  finalizeEvent({ created_at: now, content: '', tags: [], ...template }, creatorKey)
await publish([
  sign({ kind: 0, content: JSON.stringify({ name: 'Local creator', picture: picture.url }) }),
  sign({
    kind: 34235,
    tags: [
      ['d', 'local-check'],
      ['title', 'Local check video'],
      ['published_at', String(now)],
      [
        'imeta',
        `url ${video.url}`,
        'm video/mp4',
        `x ${video.sha256}`,
        `image ${picture.url}`,
        'dim 320x240',
      ],
    ],
  }),
])
const naddr = nip19.naddrEncode({ kind: 34235, pubkey: creator, identifier: 'local-check' })
if (opt.serve) {
  console.log(
    `serving ${origin} (map ${host} to 127.0.0.1); video /v/${naddr}, embed /embed.html?v=${naddr}`
  )
  console.log(`visitor nsec ${nip19.nsecEncode(visitorKey)}; Ctrl-C stops and deletes the data`)
  await new Promise(() => {})
}

// Chromium-family browser with its own throwaway profile, reached over the DevTools protocol.
const browser = spawn(
  opt.browser,
  [
    `--user-data-dir=${profileDir}`,
    '--headless=new',
    '--remote-debugging-port=0',
    '--ignore-certificate-errors',
    `--host-resolver-rules=MAP ${host} 127.0.0.1`,
    '--no-first-run',
    'about:blank',
  ],
  { stdio: 'ignore' }
)
children.push(browser)
let port
for (let i = 0; !port; i++) {
  try {
    port = readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]
  } catch {
    if (i > 100) throw new Error('browser did not start')
    await sleep(100)
  }
}
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
const cdp = new WebSocket(webSocketDebuggerUrl)
await new Promise(resolve => cdp.once('open', resolve))
let nextId = 0
const pending = new Map()
const sessions = new Map()
const publicRelays = new Set(['wss://purplepag.es', 'wss://nos.lol', 'wss://relay.damus.io'])
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    cdp.send(JSON.stringify({ id, method, params, sessionId }))
  })
const watch = async (sessionId, traffic) => {
  sessions.set(sessionId, traffic)
  await send('Network.enable', {}, sessionId)
  await send(
    'Target.setAutoAttach',
    { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
    sessionId
  )
  await send('Runtime.runIfWaitingForDebugger', {}, sessionId)
}
cdp.on('message', raw => {
  const msg = JSON.parse(raw)
  if (msg.id) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    return msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  }
  const traffic = sessions.get(msg.sessionId)
  if (!traffic) return
  if (msg.method === 'Target.attachedToTarget') {
    const watching = watch(msg.params.sessionId, traffic).catch(error =>
      traffic.failures.push(`cannot watch child target: ${error.message}`)
    )
    traffic.watches.push(watching)
  }
  if (msg.method === 'Network.requestWillBeSent' || msg.method === 'Network.webSocketCreated') {
    const isSocket = msg.method === 'Network.webSocketCreated'
    const url = isSocket ? msg.params.url : msg.params.request.url
    traffic.requests.push(url)
    if (isSocket) traffic.sockets.set(`${msg.sessionId}:${msg.params.requestId}`, url)
    if (!URL.canParse(url)) {
      traffic.failures.push(`invalid request URL: ${url}`)
      return
    }
    const parsed = new URL(url)
    if (!/^(https?|wss?):$/.test(parsed.protocol)) return
    if (parsed.host === `${host}:${opt.port}`) return
    traffic.external.add(url)
    if (
      traffic.embed ||
      !isSocket ||
      !publicRelays.has(parsed.origin) ||
      parsed.username ||
      parsed.password
    ) {
      traffic.failures.push(
        `unexpected external ${isSocket ? 'WebSocket' : 'HTTP request'}: ${url}`
      )
    } else {
      traffic.publicSockets.add(parsed.origin)
    }
  }
  if (msg.method === 'Network.webSocketFrameSent') {
    const url = traffic.sockets.get(`${msg.sessionId}:${msg.params.requestId}`)
    if (!url) {
      traffic.failures.push('sent WebSocket frame without a captured socket URL')
      return
    }
    if (!URL.canParse(url)) return // the socket URL has already failed above
    if (new URL(url).host === `${host}:${opt.port}`) return
    let frame
    try {
      frame = JSON.parse(msg.params.response.payloadData)
    } catch {
      traffic.failures.push(`non-JSON public WebSocket frame: ${url}`)
      return
    }
    if (Array.isArray(frame) && frame[0] === 'CLOSE' && frame.length === 2) return
    if (
      !Array.isArray(frame) ||
      frame[0] !== 'REQ' ||
      typeof frame[1] !== 'string' ||
      frame.length < 3 ||
      frame
        .slice(2)
        .some(
          filter =>
            !filter ||
            typeof filter !== 'object' ||
            !Array.isArray(filter.kinds) ||
            filter.kinds.length === 0 ||
            filter.kinds.some(kind => kind !== 0 && kind !== 10002) ||
            !Array.isArray(filter.authors) ||
            filter.authors.length !== 1 ||
            filter.authors[0] !== visitor
        )
    ) {
      traffic.failures.push(
        `public nonidentity request or write to ${url}: ${JSON.stringify(frame)}`
      )
      return
    }
    for (const filter of frame.slice(2))
      for (const kind of filter.kinds) traffic.identityKinds.add(kind)
  }
})

const failures = []
for (const path of ['/', `/v/${naddr}`, `/embed.html?v=${naddr}`]) {
  // A fresh target/session per page prevents old sockets and workers contaminating the next check.
  const traffic = {
    embed: path.startsWith('/embed.html'),
    requests: [],
    sockets: new Map(),
    publicSockets: new Set(),
    identityKinds: new Set(),
    external: new Set(),
    failures: [],
    watches: [],
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  await watch(sessionId, traffic)
  // Signed in as a visitor (nsec account), so the site looks the visitor's profile up.
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `if (location.origin === ${JSON.stringify(origin)}) {
  localStorage.setItem('nostr:accounts', ${JSON.stringify(JSON.stringify([{ pubkey: visitor, method: 'nsec', createdAt: Date.now() }]))})
  localStorage.setItem('nostr:active-account', ${JSON.stringify(visitor)})
  sessionStorage.setItem('nostr:session-nsec-keys', ${JSON.stringify(JSON.stringify({ [visitor]: nip19.nsecEncode(visitorKey) }))})
}`,
    },
    sessionId
  )
  await send('Page.navigate', { url: origin + path }, sessionId)
  await sleep(Number(opt.wait) * 1000)
  await Promise.all(traffic.watches)
  await send('Target.closeTarget', { targetId })
  if (!traffic.embed) {
    for (const url of publicRelays)
      if (!traffic.publicSockets.has(url))
        traffic.failures.push(`missing mandatory public socket: ${url}`)
    for (const kind of [0, 10002])
      if (!traffic.identityKinds.has(kind))
        traffic.failures.push(
          `no public visitor kind ${kind} REQ observed (check public connectivity or --wait)`
        )
  }
  console.log(
    `${path.split('?')[0].slice(0, 12)}: ${traffic.requests.length} requests, external: ${[...traffic.external].join(', ') || 'none'}`
  )
  for (const failure of traffic.failures) failures.push(`${path}: ${failure}`)
}
console.log(
  failures.length
    ? `FAILED:\n${failures.join('\n')}`
    : 'OK: public traffic is visitor identity only; video sources and embed stayed on the instance'
)
process.exit(failures.length ? 1 : 0)
