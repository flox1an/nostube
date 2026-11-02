import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/**
 * A session over `saved` whose server answers `restart` and comes back as `restarts` says. Its
 * check restarts for a new quota and allows public reach with a mirror Blossom server.
 */
const session = (saved: AdminConfig = config, { restart = false, restarts = [true] } = {}) => {
  const deps = {
    saveConfig: vi.fn(async () => ({ restart })),
    waitForRestart: vi.fn(async () => restarts.shift() ?? true),
    checkConfig: vi.fn(async (c: AdminConfig) => ({
      error: c.title === 'Refused' ? 'title refused' : null,
      restart: c.storage.quotaGib !== saved.storage.quotaGib,
      canBePublic: c.mirror.blossom.length > 0,
    })),
    reload: vi.fn(),
  }
  const s = createConfigSession({ config: saved, bootId: 'b1', canBePublic: false }, deps)
  return { s, deps, view: () => s.getSnapshot() }
}

describe('config edit session', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  /** Lets the typing pause pass and the server answer. */
  const answered = () => vi.advanceTimersByTimeAsync(300)

  it('takes restart and public eligibility from the server, for the latest draft only', async () => {
    const { s, deps, view } = session()
    s.update({ tagline: 'Hello' })
    await answered()
    expect(view()).toMatchObject({ dirty: true, restart: false, canBePublic: false })
    s.update({ quota: '10' })
    s.update({ mirrorBlossomText: 'https://blossom.example' })
    await answered()
    // Typing in a row asks once, for what was typed last.
    expect(deps.checkConfig).toHaveBeenCalledTimes(2)
    expect(view()).toMatchObject({ restart: true, canBePublic: true })
    s.discard()
    expect(view()).toMatchObject({ dirty: false, restart: false, canBePublic: false })
  })

  it("adds the server's refusal to the form's errors, and asks nothing while the form has its own", async () => {
    const { s, deps, view } = session()
    s.update({ title: 'Refused' })
    await answered()
    expect(view().errors).toEqual(['title refused'])
    deps.checkConfig.mockClear()
    s.update({ quota: 'many' })
    await answered()
    expect(deps.checkConfig).not.toHaveBeenCalled()
    expect(view().errors).toContain('title refused')
    expect(view().errors.length).toBe(2)
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
    s.update({ tagline: 'Hello' })
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
