import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS, noSitePages } from '@nostube/core/instance-config'
import type { AdminConfig } from './api'
import { applyConfig, createConfigSession } from './config-session'
import './i18n'

const PK = 'a'.repeat(64)
const config: AdminConfig = {
  title: 'My videos',
  creators: [PK],
  allowedWriters: [PK],
  videoSources: ['wss://videos.example.org'],
  interactionRelays: ['wss://videos.example.org'],
  profileRelays: [],
  signerRelays: [],
  reach: 'public',
  siteHosting: 'nsite',
  nsite: { gateway: 'nsite.lol', domain: '' },
  mirror: { relays: [], blossom: [] },
  search: { mode: 'off' },
  storage: { quotaGib: 0, freeSpaceReserveGib: 5, s3: null },
  site: {
    tagline: '',
    theme: { accent: '#8b5cf6', font: 'sans' },
    videos: { hidden: [] },
    links: DEFAULT_SITE_LINKS,
    pages: noSitePages(),
    lightning: '',
  },
}

/** A session over `saved` whose server answers `restart` and comes back as `restarts` says. */
const session = (saved: AdminConfig = config, { restart = false, restarts = [true] } = {}) => {
  const deps = {
    saveConfig: vi.fn(async () => ({ restart })),
    waitForRestart: vi.fn(async () => restarts.shift() ?? true),
    reload: vi.fn(),
  }
  const s = createConfigSession({ config: saved, bootId: 'b1', originIsPublic: true }, deps)
  return { s, deps, view: () => s.getSnapshot() }
}

describe('config edit session', () => {
  it('is dirty only with edits and warns of a restart only for restart fields', () => {
    const { s, view } = session()
    expect(view().dirty).toBe(false)
    s.update({ tagline: 'Hello' })
    expect(view()).toMatchObject({ dirty: true, restart: false })
    s.update({ quota: '10' })
    expect(view().restart).toBe(true)
    s.discard()
    expect(view().dirty).toBe(false)
  })

  it.each([
    ['turning the nsite off', { siteHosting: 'instance' as const }],
    ['switching to Private', { reach: 'private' as const }],
  ])('asks before %s, and a cancel leaves the draft alone', (_name, patch) => {
    const { s, view } = session()
    s.update(patch)
    expect(view()).toMatchObject({ askNsiteDeletion: true, dirty: false })
    s.answerNsiteDeletion(null)
    expect(view()).toMatchObject({ askNsiteDeletion: false, dirty: false })
  })

  it.each([true, false])('sends the answer (delete: %s) with the save', async remove => {
    const { s, deps, view } = session()
    s.update({ reach: 'private' })
    s.answerNsiteDeletion(remove)
    expect(view().draft).toMatchObject({ reach: 'private', siteHosting: 'instance' })
    await s.save()
    expect(deps.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ reach: 'private', siteHosting: 'instance' }),
      remove
    )
    expect(deps.reload).toHaveBeenCalledOnce()
  })

  it('forgets the answer when the nsite is switched on again', async () => {
    const { s, deps } = session()
    s.update({ siteHosting: 'instance' })
    s.answerNsiteDeletion(true)
    s.update({ siteHosting: 'nsite', title: 'Renamed' })
    await s.save()
    expect(deps.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed' }),
      undefined
    )
  })

  it('asks nothing and sends no answer when the nsite was not on', async () => {
    const { s, deps, view } = session({ ...config, siteHosting: 'instance' })
    s.update({ reach: 'private' })
    expect(view().askNsiteDeletion).toBe(false)
    await s.save()
    expect(deps.saveConfig).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it('waits through a stalled restart and reloads once the server is back', async () => {
    const { s, deps, view } = session(config, { restart: true, restarts: [false, true] })
    s.update({ quota: '10' })
    const phases: (string | null)[] = []
    s.subscribe(() => phases.push(view().saving))
    await s.save()
    expect(phases).toEqual(['saving', 'restarting', 'stalled'])
    expect(deps.waitForRestart).toHaveBeenLastCalledWith('b1', { timeoutMs: Infinity })
    expect(deps.reload).toHaveBeenCalledOnce()
  })

  it('keeps the draft and says why when the server refuses', async () => {
    const { s, deps, view } = session()
    deps.saveConfig.mockRejectedValue(new Error('server said no'))
    s.update({ tagline: 'Hello' })
    await s.save()
    expect(view()).toMatchObject({ saving: null, saveError: 'server said no', dirty: true })
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('saves a hidden video at once and keeps other edits as a draft', async () => {
    const { s, deps, view } = session()
    s.update({ tagline: 'Draft only' })
    await s.saveHidden('ev1\n')
    expect(deps.saveConfig).toHaveBeenCalledExactlyOnceWith({
      ...config,
      site: { ...config.site, videos: { hidden: ['ev1'] } },
    })
    expect(view().saved.site.videos.hidden).toEqual(['ev1'])
    expect(view().draft).toMatchObject({ tagline: 'Draft only', hiddenText: 'ev1\n' })
    expect(view().dirty).toBe(true)
  })
})

describe('applyConfig', () => {
  it('reports no phase when the server applies without a restart', async () => {
    const onPhase = vi.fn()
    const deps = { saveConfig: async () => ({ restart: false }), waitForRestart: vi.fn() }
    await applyConfig(deps, config, 'b1', onPhase)
    expect(onPhase).not.toHaveBeenCalled()
    expect(deps.waitForRestart).not.toHaveBeenCalled()
  })
})
