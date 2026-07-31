import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useAppContext, useSelectedPreset, useUserBlossomServers } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { XIcon, Cog, LoaderIcon, ChevronDown, ChevronRight, LockKeyhole } from 'lucide-react'
import { normalizeRelayUrl, cn } from '@/lib/utils'
import { isBlossomServerBlocked } from '@/constants/relays'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/hooks/useToast'
import {
  type RelayTag,
  type BlossomServer,
  type BlossomServerTag,
  type CachingServer,
} from '@/contexts/AppContext'
import { DEFAULT_MIRROR_SERVERS, DEFAULT_UPLOAD_SERVERS } from '@/lib/blossom-servers'
import { ViewTrackingSettingsSection } from './ViewTrackingSettingsSection'
import { usePrivateRelays } from '@/contexts/PrivateRelaysContext'

// ─── Helpers ────────────────────────────────────────

function deriveServerName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function normalizeServerUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

function normalizeBlossomServers(servers: unknown): BlossomServer[] {
  if (!Array.isArray(servers)) return []
  return servers
    .filter(
      (server): server is { url?: unknown; name?: unknown; tags?: unknown } =>
        typeof server === 'object' && server !== null
    )
    .map(server => {
      const url = typeof server.url === 'string' ? normalizeServerUrl(server.url) : ''
      const name =
        typeof server.name === 'string' && server.name.trim().length > 0
          ? server.name
          : deriveServerName(url)
      const tags = Array.isArray(server.tags)
        ? server.tags.filter(
            (tag): tag is BlossomServerTag => tag === 'mirror' || tag === 'initial upload'
          )
        : []
      return { url, name, tags }
    })
    .filter(server => server.url.length > 0)
}

function normalizeCachingServers(servers: unknown): CachingServer[] {
  if (!Array.isArray(servers)) return []
  return servers
    .filter(
      (server): server is { url?: unknown; name?: unknown } =>
        typeof server === 'object' && server !== null
    )
    .map(server => {
      const url = typeof server.url === 'string' ? normalizeServerUrl(server.url) : ''
      const name =
        typeof server.name === 'string' && server.name.trim().length > 0
          ? server.name
          : deriveServerName(url)
      return { url, name }
    })
    .filter(server => server.url.length > 0)
}

// ─── Collapsible Section ────────────────────────────

function CollapsibleSection({
  id,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  id: string
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = `${id}-settings-section`

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <div id={id} className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={contentId}
      >
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div id={contentId} className="px-4 pb-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Relays ──────────────────────────────────────────

function RelaysSubSection() {
  const { t } = useTranslation()
  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const [newRelayUrl, setNewRelayUrl] = useState('')

  const handleAddRelay = () => {
    if (newRelayUrl.trim()) {
      const normalizedUrl = normalizeRelayUrl(newRelayUrl.trim())
      updateConfig(currentConfig => {
        const relays = currentConfig.relays || []
        if (relays.some(r => r.url === normalizedUrl)) return currentConfig
        return {
          ...currentConfig,
          relays: [
            ...relays,
            {
              url: normalizedUrl,
              name: normalizedUrl.replace(/^wss:\/\//, '').replace(/\/$/, ''),
              tags: ['read', 'write'] as RelayTag[],
            },
          ],
        }
      })
      setNewRelayUrl('')
    }
  }

  const handleRemoveRelay = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      relays: currentConfig.relays.filter(r => r.url !== urlToRemove),
    }))
  }

  const handleResetRelays = () => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      relays: presetContent.defaultRelays.map(url => ({
        url,
        name: url.replace(/^wss:\/\//, '').replace(/\/$/, ''),
        tags: ['read', 'write'] as RelayTag[],
      })),
    }))
  }

  const handleToggleTag = (relayUrl: string, tag: RelayTag) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      relays: currentConfig.relays.map(r =>
        r.url === relayUrl
          ? { ...r, tags: r.tags.includes(tag) ? r.tags.filter(t => t !== tag) : [...r.tags, tag] }
          : r
      ),
    }))
  }

  const availableTags: RelayTag[] = ['read', 'write']
  const readRelayCount = config.relays.filter(r => r.tags.includes('read')).length
  const writeRelayCount = config.relays.filter(r => r.tags.includes('write')).length
  const showSizeWarning = readRelayCount > 4 || writeRelayCount > 4

  return (
    <>
      {showSizeWarning && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            <strong>NIP-65 Recommendation:</strong> Consider keeping your relay list small (2-4
            read, 2-4 write relays).
            {readRelayCount > 4 && ` Currently: ${readRelayCount} read relays.`}
            {writeRelayCount > 4 && ` Currently: ${writeRelayCount} write relays.`}
          </p>
        </div>
      )}
      {config.relays.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.relays.noRelays')}</p>
      ) : (
        <ScrollArea className="w-full rounded-md border p-3 max-h-48">
          <ul className="space-y-1.5">
            {config.relays.map(relay => (
              <li key={relay.url} className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{relay.name || relay.url}</span>
                  <div className="flex gap-1 shrink-0">
                    {(relay.tags || []).map(tag => (
                      <Badge
                        key={tag}
                        variant={tag === 'write' ? 'default' : 'outline'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {t(`settings.relays.${tag}`)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('settings.relays.editTags')}
                      >
                        <Cog className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableTags.map(tag => (
                        <DropdownMenuCheckboxItem
                          key={tag}
                          checked={(relay.tags || []).includes(tag)}
                          onCheckedChange={() => handleToggleTag(relay.url, tag)}
                        >
                          {t(`settings.relays.${tag}`)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRemoveRelay(relay.url)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
      <div className="flex gap-2">
        <Input
          placeholder={t('settings.relays.addPlaceholder')}
          value={newRelayUrl}
          onChange={e => setNewRelayUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddRelay()
          }}
          className="flex-1"
        />
        <Button onClick={handleAddRelay} size="sm">
          {t('settings.relays.addButton')}
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={handleResetRelays}>
        {t('settings.relays.resetButton')}
      </Button>
    </>
  )
}

// ─── Private relays ──────────────────────────────────

function PrivateRelaysSubSection() {
  const { relays, isLoading, error, canConfigure, statuses, configure } = usePrivateRelays()
  const [newRelayUrl, setNewRelayUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const save = async (nextRelays: string[]) => {
    setIsSaving(true)
    try {
      await configure(nextRelays)
      setNewRelayUrl('')
    } catch (cause) {
      toast({
        title: 'Could not update private relays',
        description: cause instanceof Error ? cause.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddRelay = async () => {
    const normalized = normalizeRelayUrl(newRelayUrl)
    try {
      const parsed = new URL(normalized)
      if (
        (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') ||
        relays.includes(normalized)
      ) {
        return
      }
    } catch {
      return
    }

    await save([...relays, normalized])
  }

  return (
    <>
      <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3">
        <div className="flex gap-2">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-muted-foreground">
            Private playlists and upload drafts are published only to these relays. The relay list
            is NIP-44 encrypted and advertised as kind 10013 on your NIP-65 write relays. There is
            no public-relay fallback.
          </p>
        </div>
      </div>

      {!canConfigure && (
        <p className="text-sm text-yellow-600 dark:text-yellow-400">
          A NIP-44 capable signer and a published NIP-65 write relay list are required.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderIcon className="h-4 w-4 animate-spin" />
          Loading private relay list…
        </div>
      ) : relays.length === 0 ? (
        <p className="text-sm text-muted-foreground">No private relays configured.</p>
      ) : (
        <ScrollArea className="max-h-48 w-full rounded-md border p-3">
          <ul className="space-y-1.5">
            {relays.map(relay => (
              <li key={relay} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{relay}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={statuses[relay] === 'authenticated' ? 'default' : 'outline'}>
                    {statuses[relay] ?? 'disconnected'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isSaving}
                    onClick={() => void save(relays.filter(candidate => candidate !== relay))}
                    aria-label={`Remove ${relay}`}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="wss://private-relay.example"
          value={newRelayUrl}
          disabled={!canConfigure || isSaving}
          onChange={event => setNewRelayUrl(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') void handleAddRelay()
          }}
        />
        <Button
          size="sm"
          disabled={!canConfigure || isSaving || !newRelayUrl.trim()}
          onClick={() => void handleAddRelay()}
        >
          {isSaving && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
          Add
        </Button>
      </div>
    </>
  )
}

// ─── Blossom ─────────────────────────────────────────

const blossomAvailableTags: BlossomServerTag[] = ['mirror', 'initial upload']

function BlossomSubSection() {
  const { t } = useTranslation()
  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const [newServerUrl, setNewServerUrl] = useState('')
  const userBlossomServers = useUserBlossomServers()
  const blossomServers = useMemo(
    () => normalizeBlossomServers(config.blossomServers),
    [config.blossomServers]
  )

  // Self-heal malformed entries
  useEffect(() => {
    const current = config.blossomServers
    if (!Array.isArray(current)) return
    const normalized = normalizeBlossomServers(current)
    const currentJson = JSON.stringify(current)
    const normalizedJson = JSON.stringify(normalized)
    if (currentJson !== normalizedJson) {
      updateConfig(currentConfig => ({ ...currentConfig, blossomServers: normalized }))
    }
  }, [config.blossomServers, updateConfig])

  const handleAddServer = () => {
    if (newServerUrl.trim()) {
      const normalizedUrl = normalizeServerUrl(newServerUrl.trim())
      if (isBlossomServerBlocked(normalizedUrl)) {
        toast({
          title: t('settings.blossom.blockedServer'),
          description: t('settings.blossom.blockedServerDescription'),
          variant: 'destructive',
        })
        setNewServerUrl('')
        return
      }
      updateConfig(currentConfig => {
        const servers = normalizeBlossomServers(currentConfig.blossomServers)
        if (servers.some(s => s.url === normalizedUrl)) return currentConfig
        return {
          ...currentConfig,
          blossomServers: [
            ...servers,
            { url: normalizedUrl, name: deriveServerName(normalizedUrl), tags: [] },
          ],
        }
      })
      setNewServerUrl('')
    }
  }

  const handleRemoveServer = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: normalizeBlossomServers(currentConfig.blossomServers).filter(
        s => s.url !== urlToRemove
      ),
    }))
  }

  const handleResetServers = () => {
    if (userBlossomServers.data && userBlossomServers.data?.length > 0) {
      updateConfig(currentConfig => ({
        ...currentConfig,
        blossomServers: userBlossomServers.data
          .filter(s => !isBlossomServerBlocked(s))
          .map(s => ({
            url: s,
            name: s.replace(/^https?:\/\//, ''),
            tags: [] as BlossomServerTag[],
          })),
      }))
    } else {
      updateConfig(currentConfig => {
        const servers: BlossomServer[] = []
        if (presetContent.defaultBlossomProxy) {
          servers.push({
            url: presetContent.defaultBlossomProxy,
            name: deriveServerName(presetContent.defaultBlossomProxy),
            tags: ['initial upload'] as BlossomServerTag[],
          })
        }
        DEFAULT_UPLOAD_SERVERS.forEach(url => {
          if (servers.some(server => server.url === url) || isBlossomServerBlocked(url)) return
          servers.push({
            url,
            name: deriveServerName(url),
            tags: ['initial upload'],
          })
        })
        DEFAULT_MIRROR_SERVERS.forEach(url => {
          if (servers.some(server => server.url === url) || isBlossomServerBlocked(url)) return
          servers.push({
            url,
            name: deriveServerName(url),
            tags: ['mirror'],
          })
        })
        return { ...currentConfig, blossomServers: servers }
      })
    }
  }

  const handleToggleTag = (serverUrl: string, tag: BlossomServerTag) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: normalizeBlossomServers(currentConfig.blossomServers).map(s =>
        s.url === serverUrl
          ? { ...s, tags: s.tags.includes(tag) ? s.tags.filter(t => t !== tag) : [...s.tags, tag] }
          : s
      ),
    }))
  }

  return (
    <>
      {blossomServers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.blossom.noServers')}</p>
      ) : (
        <ScrollArea className="w-full rounded-md border p-3 max-h-48">
          <ul className="space-y-1.5">
            {blossomServers.map(server => (
              <li key={server.url} className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{server.name || server.url}</span>
                  <div className="flex gap-1 shrink-0">
                    {server.tags.map(tag => (
                      <Badge
                        key={tag}
                        variant="default"
                        className={cn(
                          'text-[10px] px-1.5 py-0',
                          tag === 'mirror' ? 'bg-blue-500' : 'bg-orange-500'
                        )}
                      >
                        {t(`settings.blossom.${tag === 'mirror' ? 'mirror' : 'initialUpload'}`)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Cog className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {blossomAvailableTags.map(tag => (
                        <DropdownMenuCheckboxItem
                          key={tag}
                          checked={server.tags.includes(tag)}
                          onCheckedChange={() => handleToggleTag(server.url, tag)}
                        >
                          {t(`settings.blossom.${tag === 'mirror' ? 'mirror' : 'initialUpload'}`)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRemoveServer(server.url)}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
      <div className="flex gap-2">
        <Input
          placeholder={t('settings.blossom.addPlaceholder')}
          value={newServerUrl}
          onChange={e => setNewServerUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddServer()
          }}
          className="flex-1"
        />
        <Button onClick={handleAddServer} size="sm">
          {t('settings.blossom.addButton')}
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={handleResetServers}>
        {t('settings.blossom.resetButton')}
      </Button>
    </>
  )
}

// ─── Caching / Streaming ────────────────────────────

type ServerStatus = 'checking' | 'online' | 'offline'

function useServerStatus(urls: string[]) {
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  const checkServer = useCallback((url: string) => {
    controllersRef.current.get(url)?.abort()
    const controller = new AbortController()
    controllersRef.current.set(url, controller)
    setStatuses(prev => ({ ...prev, [url]: 'checking' }))
    const timeout = setTimeout(() => controller.abort(), 5000)
    fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'manual' })
      .then(res => {
        clearTimeout(timeout)
        setStatuses(prev => ({ ...prev, [url]: res.status < 400 ? 'online' : 'offline' }))
      })
      .catch(() => {
        clearTimeout(timeout)
        setStatuses(prev => ({ ...prev, [url]: 'offline' }))
      })
      .finally(() => controllersRef.current.delete(url))
  }, [])

  const urlsKey = useMemo(() => urls.join(','), [urls])

  useEffect(() => {
    urls.forEach(checkServer)
    const controllers = controllersRef.current
    return () => {
      controllers.forEach(c => c.abort())
      controllers.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlsKey, checkServer])

  return statuses
}

function StatusDot({ status }: { status: ServerStatus | undefined }) {
  if (!status || status === 'checking') {
    return <LoaderIcon className="h-3 w-3 animate-spin text-muted-foreground" />
  }
  if (status === 'online') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
}

function CachingSubSection() {
  const { t } = useTranslation()
  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const [newServerUrl, setNewServerUrl] = useState('http://127.0.0.1:24242')
  const cachingServers = useMemo(
    () => normalizeCachingServers(config.cachingServers),
    [config.cachingServers]
  )
  const serverUrls = useMemo(() => cachingServers.map(s => s.url), [cachingServers])
  const serverStatuses = useServerStatus(serverUrls)
  const p2pHlsBlobCacheEnabled = config.p2p?.hlsBlobCacheEnabled ?? false

  useEffect(() => {
    const current = config.cachingServers
    if (!Array.isArray(current)) return
    const normalized = normalizeCachingServers(current)
    if (JSON.stringify(current) !== JSON.stringify(normalized)) {
      updateConfig(currentConfig => ({ ...currentConfig, cachingServers: normalized }))
    }
  }, [config.cachingServers, updateConfig])

  const handleAddServer = () => {
    if (newServerUrl.trim()) {
      const normalizedUrl = normalizeServerUrl(newServerUrl.trim())
      updateConfig(currentConfig => {
        const servers = normalizeCachingServers(currentConfig.cachingServers)
        if (servers.some(s => s.url === normalizedUrl)) return currentConfig
        return {
          ...currentConfig,
          cachingServers: [
            ...servers,
            { url: normalizedUrl, name: deriveServerName(normalizedUrl) },
          ],
        }
      })
      setNewServerUrl('')
    }
  }

  const handleRemoveServer = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      cachingServers: normalizeCachingServers(currentConfig.cachingServers).filter(
        s => s.url !== urlToRemove
      ),
    }))
  }

  const handleResetServers = () => {
    updateConfig(currentConfig => {
      const servers: CachingServer[] = []
      if (presetContent.defaultBlossomProxy) {
        servers.push({
          url: presetContent.defaultBlossomProxy,
          name: deriveServerName(presetContent.defaultBlossomProxy),
        })
      }
      return { ...currentConfig, cachingServers: servers }
    })
  }

  const handleToggleP2PCache = (enabled: boolean) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      p2p: {
        ...currentConfig.p2p,
        hlsBlobCacheEnabled: enabled,
      },
    }))
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="p2p-hls-blob-cache" className="text-sm font-medium">
            {t('settings.caching.p2pCacheTitle')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t('settings.caching.p2pCacheDescription')}
          </p>
        </div>
        <Switch
          id="p2p-hls-blob-cache"
          checked={p2pHlsBlobCacheEnabled}
          onCheckedChange={handleToggleP2PCache}
        />
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <p>{t('settings.caching.description')}</p>
        <ul className="list-disc list-inside ml-1">
          <li>{t('settings.caching.useCase1')}</li>
          <li>{t('settings.caching.useCase2')}</li>
        </ul>
      </div>
      {cachingServers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.caching.noServers')}</p>
      ) : (
        <ScrollArea className="w-full rounded-md border p-3 max-h-48">
          <ul className="space-y-1.5">
            {cachingServers.map(server => (
              <li key={server.url} className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={serverStatuses[server.url]} />
                  <span className="truncate">{server.name || server.url}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleRemoveServer(server.url)}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
      <div className="flex gap-2">
        <Input
          placeholder={t('settings.caching.addPlaceholder')}
          value={newServerUrl}
          onChange={e => setNewServerUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleAddServer()
          }}
          className="flex-1"
        />
        <Button onClick={handleAddServer} size="sm">
          {t('settings.caching.addButton')}
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={handleResetServers}>
        {t('settings.caching.resetButton')}
      </Button>
    </>
  )
}

// ─── Main Section ────────────────────────────────────

export function NetworkSettingsSection() {
  const { t } = useTranslation()
  const location = useLocation()
  const activeSection = location.hash.replace('#', '')

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('settings.network.description', {
          defaultValue:
            'Configure your Nostr network connections, video hosting, and streaming servers.',
        })}
      </p>

      <CollapsibleSection
        id="relays"
        title={t('settings.relays.title')}
        description={t('settings.relays.description')}
        defaultOpen={!activeSection || activeSection === 'relays'}
      >
        <RelaysSubSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="private-relays"
        title="Private relays"
        description="Encrypted relay routing for private nostube content."
        defaultOpen={activeSection === 'private-relays'}
      >
        <PrivateRelaysSubSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="blossom"
        title={t('settings.blossom.title')}
        description={t('settings.blossom.description')}
        defaultOpen={activeSection === 'blossom'}
      >
        <BlossomSubSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="caching"
        title={t('settings.caching.title')}
        defaultOpen={activeSection === 'caching'}
      >
        <CachingSubSection />
      </CollapsibleSection>

      <CollapsibleSection
        id="view-tracking"
        title="View Tracking"
        description="Control how your viewing activity is reported to video creators."
        defaultOpen={activeSection === 'view-tracking'}
      >
        <ViewTrackingSettingsSection />
      </CollapsibleSection>
    </div>
  )
}
