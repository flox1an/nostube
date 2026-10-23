#!/usr/bin/env node
// Real two-node check: mesh DNS, routing and Nostr from the unprivileged server container.
// Requires Docker with TUN. Uses only temporary state and a unique Compose project.
//   NOSTUBE_IMAGE=nostube-server:local node apps/server/scripts/check-fips.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const server = fileURLToPath(new URL('../', import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'nostube-fips-check-'))
const file = join(temporary, 'compose.json')
const project = `nostube-fips-check-${process.pid}`
const env = { ...process.env, NOSTUBE_ORIGIN: '' }
const docker = (...args) =>
  execFileSync('docker', args, {
    env,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  })
const compose = (...args) => docker('compose', '-p', project, '-f', file, ...args)
const inServer = (name, ...args) => compose('exec', '-T', '--user', '10001', name, ...args)
// Controlled test mesh: do not discover public peers or publish test identities on public relays.
// JSON is valid YAML and avoids rewriting the operator's discovery settings in the sample config.
const configuration = {
  node: { identity: { persistent: true }, rendezvous: { nostr: { enabled: false } } },
  tun: { enabled: true, name: 'fips0', mtu: 1280 },
  dns: { enabled: true, bind_addr: '127.0.0.1', port: 5354 },
  transports: { udp: { bind_addr: '0.0.0.0:2121' } },
  peers: [],
}
let started = false

async function eventually(check) {
  let failure
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return check()
    } catch (error) {
      failure = error
      await sleep(1000)
    }
  }
  throw failure
}

function cleanup() {
  if (started) compose('down', '--volumes', '--remove-orphans')
  rmSync(temporary, { recursive: true, force: true })
}
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    cleanup()
    process.exit(code)
  })
}

try {
  const config = JSON.parse(
    docker('compose', '-f', join(server, 'docker-compose.fips.yml'), 'config', '--format', 'json')
  )
  delete config.name
  // An explicitly supplied image is already built; otherwise exercise the standard source build.
  if (process.env.NOSTUBE_IMAGE) delete config.services.nostube.build
  // `compose config` expands generated network names; don't reuse the operator's network.
  for (const network of Object.values(config.networks ?? {})) delete network.name
  const clone = value => structuredClone(value)
  config.services.peer = clone(config.services.fips)
  config.services.peer_nostube = clone(config.services.nostube)
  config.services.peer_nostube.network_mode = 'service:peer'
  config.services.peer_nostube.depends_on = { peer: { condition: 'service_healthy' } }

  for (const [fips, app, label] of [
    ['fips', 'nostube', 'a'],
    ['peer', 'peer_nostube', 'b'],
  ]) {
    for (const kind of ['fips', 'data']) mkdirSync(join(temporary, `${label}-${kind}`))
    writeFileSync(join(temporary, `${label}-fips/fips.yaml`), JSON.stringify(configuration))
    config.services[fips].ports = []
    config.services[fips].volumes.find(volume => volume.target === '/etc/fips').source = join(
      temporary,
      `${label}-fips`
    )
    config.services[app].volumes.find(volume => volume.target === '/data').source = join(
      temporary,
      `${label}-data`
    )
  }
  writeFileSync(file, JSON.stringify(config))
  started = true
  console.log('Building images and starting the first mesh node…')
  console.log(compose('build', 'fips', ...(process.env.NOSTUBE_IMAGE ? [] : ['nostube'])))
  console.log(compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'fips'))
  const first = compose('exec', '-T', 'fips', 'cat', '/etc/fips/fips.pub').trim()
  assert.match(first, /^npub1\S+$/)
  const id = compose('ps', '-q', 'fips').trim()
  const inspect = JSON.parse(docker('inspect', id))[0]
  const address = Object.values(inspect.NetworkSettings.Networks)[0].IPAddress
  const peerConfig = {
    ...configuration,
    peers: [
      {
        npub: first,
        addresses: [{ transport: 'udp', addr: `${address}:2121` }],
        connect_policy: 'auto_connect',
        auto_reconnect: true,
      },
    ],
  }
  writeFileSync(join(temporary, 'b-fips/fips.yaml'), JSON.stringify(peerConfig))
  console.log(compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'peer'))
  const second = compose('exec', '-T', 'peer', 'cat', '/etc/fips/fips.pub').trim()
  assert.notEqual(first, second, 'nodes must have separate identities')
  config.services.nostube.environment.NOSTUBE_ORIGIN = `http://${first}.fips`
  config.services.peer_nostube.environment.NOSTUBE_ORIGIN = `http://${second}.fips`
  writeFileSync(file, JSON.stringify(config))
  console.log(
    compose('up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'nostube', 'peer_nostube')
  )

  for (const [app, remote] of [
    ['nostube', second],
    ['peer_nostube', first],
  ]) {
    const status = inServer(app, 'cat', '/proc/1/status')
    assert.match(status, /^Uid:\s+10001\s+10001\s+10001\s+10001$/m)
    assert.match(status, /^CapEff:\s+0+$/m)
    inServer(app, 'test', '!', '-e', '/etc/fips/fips.key')
    inServer(app, 'test', '!', '-e', '/dev/net/tun')
    assert.match(inServer(app, 'getent', 'hosts', `${remote}.fips`), /fd[0-9a-f]{2}:/i)
    inServer(app, 'getent', 'ahosts', 'example.org')
    const request = (...args) =>
      inServer(
        app,
        'curl',
        '--noproxy',
        '*',
        '-fsS',
        '--connect-timeout',
        '3',
        '--max-time',
        '10',
        ...args
      )
    const base = `http://${remote}.fips`
    const health = await eventually(() => JSON.parse(request(`${base}/api/health`)))
    assert.equal(health.ok, true)
    const own = app === 'nostube' ? first : second
    const publicConfig = JSON.parse(request('http://[::1]/api/config'))
    assert.equal(publicConfig.origin, `http://${own}.fips`)
    assert.deepEqual(publicConfig.videoSources, [`ws://${own}.fips`])
    assert.deepEqual(publicConfig.interactionRelays, [`ws://${own}.fips`])
    const relay = JSON.parse(request('-H', 'Accept: application/nostr+json', `${base}/`))
    assert.ok(relay.supported_nips.includes(1), 'peer must answer NIP-11 as a Nostr relay')
    // A real multi-megabyte response catches MTU/segmentation failures hidden by small health checks.
    assert.equal(
      request(`${base}/embed.html`),
      request('http://[::1]/embed.html'),
      'mesh transfer must preserve the complete embed player'
    )
    // curl keeps an upgraded socket open: its timeout is expected after the 101 response.
    const handshake = spawnSync(
      'docker',
      [
        'compose',
        '-p',
        project,
        '-f',
        file,
        'exec',
        '-T',
        '--user',
        '10001',
        app,
        'curl',
        '--noproxy',
        '*',
        '-sS',
        '-i',
        '-N',
        '--max-time',
        '2',
        '-H',
        'Connection: Upgrade',
        '-H',
        'Upgrade: websocket',
        '-H',
        'Sec-WebSocket-Version: 13',
        '-H',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        `${base}/`,
      ],
      { env, encoding: 'utf8', timeout: 10_000 }
    )
    assert.match(handshake.stdout, /^HTTP\/1\.1 101 Switching Protocols\r?$/m)
    console.log(
      `${app}: uid 10001, no capabilities/key/TUN; normal DNS, mesh DNS, HTTP and WebSocket OK`
    )
  }
  // Daemon recovery must preserve the namespace so the application does not need a restart.
  compose(
    'exec',
    '-T',
    'fips',
    'sh',
    '-c',
    'for proc in /proc/[0-9]*; do read -r comm < "$proc/comm" || continue; case "$comm" in fips|dnsmasq) kill -TERM "${proc##*/}";; esac; done'
  )
  await eventually(() => {
    inServer('nostube', 'getent', 'hosts', `${second}.fips`)
    assert.equal(
      JSON.parse(
        inServer(
          'nostube',
          'curl',
          '--noproxy',
          '*',
          '-fsS',
          '--max-time',
          '5',
          `http://${second}.fips/api/health`
        )
      ).ok,
      true
    )
  })
  assert.equal(compose('ps', '-q', 'fips').trim(), id)
  assert.equal(compose('exec', '-T', 'fips', 'cat', '/etc/fips/fips.pub').trim(), first)
  console.log('DNS/FIPS daemon recovery: same container, identity and mesh access OK')
  // Explicit coordinated restart: the app must rejoin its namespace owner's network.
  compose('stop', 'nostube', 'fips')
  compose('up', '-d', '--wait', '--wait-timeout', '120', 'nostube')
  assert.equal(compose('exec', '-T', 'fips', 'cat', '/etc/fips/fips.pub').trim(), first)
  await eventually(() =>
    assert.equal(
      JSON.parse(
        inServer(
          'nostube',
          'curl',
          '--noproxy',
          '*',
          '-fsS',
          '--max-time',
          '5',
          `http://${second}.fips/api/health`
        )
      ).ok,
      true
    )
  )
  console.log('Coordinated restart: persistent identity and mesh access OK')
} finally {
  cleanup()
}
