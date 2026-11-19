import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext, useCurrentUser, useNostrPublish, useUserBlossomServers } from '@/hooks'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { Loader2, Plus, XIcon } from 'lucide-react'
import { isBlossomServerBlocked } from '@/constants/relays'
import { toast } from '@/hooks/useToast'
import { Checkbox } from '@nostube/widgets/components/checkbox'
import {
  configuredServerUrls,
  defaultBlossomServers,
  deriveServerName,
  normalizeBlossomServers,
  removeServer,
  serverListSignature,
  setServerUpload,
} from '@/lib/blossom-servers'

function normalizeServerUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

/**
 * The user's Blossom servers as one flat list. A checkbox per server decides whether uploads go
 * there (all active servers get the file; the strategy picks which one is sent first). The list can be published to the profile (kind 10063),
 * which other Nostr apps use to find the user's media.
 */
export function BlossomServersSection() {
  const { t } = useTranslation()
  const { config, updateConfig } = useAppContext()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const [newServerUrl, setNewServerUrl] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  // After the add form closes, focus goes back to its button instead of the dialog itself.
  const returnFocusRef = useRef(false)
  useEffect(() => {
    if (addOpen || !returnFocusRef.current) return
    returnFocusRef.current = false
    addButtonRef.current?.focus()
  }, [addOpen])
  const userBlossomServers = useUserBlossomServers()
  const blossomServers = useMemo(
    () => normalizeBlossomServers(config.blossomServers),
    [config.blossomServers]
  )

  // Self-heal malformed/legacy local config so Settings never crashes on invalid entries.
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
    if (!newServerUrl.trim()) return
    const normalizedUrl = normalizeServerUrl(newServerUrl.trim())
    setNewServerUrl('')

    // Block servers that re-encode videos
    if (isBlossomServerBlocked(normalizedUrl)) {
      toast({
        title: t('settings.blossom.blockedServer'),
        description: t('settings.blossom.blockedServerDescription'),
        variant: 'destructive',
      })
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
  }

  const handleRemoveServer = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: removeServer(
        normalizeBlossomServers(currentConfig.blossomServers),
        urlToRemove
      ),
    }))
  }

  const handleToggleUpload = (url: string, enabled: boolean) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: setServerUpload(
        normalizeBlossomServers(currentConfig.blossomServers),
        url,
        enabled
      ),
    }))
  }
  const activeCount = blossomServers.filter(server => server.upload !== false).length

  /** Replace the list: the servers published on the profile when there are any, else defaults. */
  const handleUseDefaults = () => {
    const fromProfile = (userBlossomServers.data ?? []).filter(s => !isBlossomServerBlocked(s))
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers:
        fromProfile.length > 0
          ? fromProfile.map(url => ({ url, name: deriveServerName(url), tags: [] }))
          : defaultBlossomServers(),
    }))
  }

  /** Publish the list as kind 10063 (BUD-03), replacing whatever the profile had. */
  const handlePublishList = async () => {
    if (blossomServers.length === 0) return
    setIsPublishing(true)
    try {
      await publish({
        event: {
          kind: 10063,
          content: '',
          tags: blossomServers.map(server => ['server', server.url]),
          created_at: Math.floor(Date.now() / 1000),
        },
        label: t('settings.blossom.publishButton', {
          defaultValue: 'Publish list to Nostr profile',
        }),
      })
      toast({ title: t('settings.blossom.publishDone'), duration: 3000 })
    } catch (error) {
      toast({
        title: t('settings.blossom.publishFailed'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
        duration: 5000,
      })
    } finally {
      setIsPublishing(false)
    }
  }

  const profileUrls = userBlossomServers.data ?? []
  const localUrls = configuredServerUrls(blossomServers)
  const profileDiffers =
    user?.pubkey != null && serverListSignature(profileUrls) !== serverListSignature(localUrls)

  const closeAddForm = () => {
    setAddOpen(false)
    setNewServerUrl('')
    returnFocusRef.current = true
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('settings.blossom.listHint', {
            defaultValue: 'Your uploads go to every checked server.',
          })}
        </p>

        {blossomServers.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            {t('settings.blossom.noServers')}
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-md border">
            {blossomServers.map(server => {
              const active = server.upload !== false
              const label = server.name || server.url
              return (
                <li key={server.url} className="group flex items-center gap-1 pr-1">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
                    <Checkbox
                      checked={active}
                      // The last active server stays on: an upload needs somewhere to go.
                      disabled={active && activeCount === 1}
                      onCheckedChange={checked => handleToggleUpload(server.url, checked === true)}
                      aria-label={t('settings.blossom.useForUploads', {
                        defaultValue: 'Upload to {{server}}',
                        server: label,
                      })}
                    />
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm ${active ? 'font-medium' : 'text-muted-foreground'}`}
                      >
                        {label}
                      </span>
                      {!active && (
                        <span className="block text-xs text-muted-foreground">
                          {t('settings.blossom.playbackOnly', {
                            defaultValue: 'No uploads, still used to find your videos',
                          })}
                        </span>
                      )}
                    </span>
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleRemoveServer(server.url)}
                    aria-label={t('settings.blossom.removeServer', {
                      defaultValue: 'Remove {{server}}',
                      server: label,
                    })}
                    title={t('settings.blossom.remove', { defaultValue: 'Remove server' })}
                  >
                    <XIcon />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {addOpen ? (
          <form
            // A surrounding dialog leaves Escape to this form (see `onEscapeKeyDown` there).
            data-add-server-form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={event => {
              event.preventDefault()
              handleAddServer()
              closeAddForm()
            }}
          >
            <Input
              autoFocus
              inputMode="url"
              placeholder={t('settings.blossom.addPlaceholder')}
              value={newServerUrl}
              onChange={e => setNewServerUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') closeAddForm()
              }}
              aria-label={t('settings.blossom.addButton')}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" disabled={!newServerUrl.trim()}>
                {t('common.add', { defaultValue: 'Add' })}
              </Button>
              <Button type="button" variant="ghost" onClick={closeAddForm}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            ref={addButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            {t('settings.blossom.addButton')}
          </Button>
        )}
      </div>

      <div className="space-y-3 border-t pt-4">
        {user && (
          <p className="text-xs text-muted-foreground">
            {profileUrls.length === 0
              ? t('settings.blossom.profileEmpty', {
                  defaultValue:
                    'Your Nostr profile has no server list yet. Publishing it lets other apps find your videos.',
                })
              : profileDiffers
                ? t('settings.blossom.profileDiffers', {
                    defaultValue:
                      'Your profile lists other servers ({{count}}). Publish to replace that list.',
                    count: profileUrls.length,
                  })
                : t('settings.blossom.profileMatches', {
                    defaultValue: 'Your profile lists these {{count}} servers.',
                    count: localUrls.length,
                  })}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {user && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePublishList}
              disabled={isPublishing || blossomServers.length === 0 || !profileDiffers}
            >
              {isPublishing && <Loader2 className="animate-spin" />}
              {t('settings.blossom.publishButton', {
                defaultValue: 'Publish list to Nostr profile',
              })}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleUseDefaults}
          >
            {t('settings.blossom.resetButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
