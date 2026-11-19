import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext, useCurrentUser, useNostrPublish, useUserBlossomServers } from '@/hooks'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { ScrollArea } from '@nostube/widgets/components/scroll-area'
import { Loader2, XIcon } from 'lucide-react'
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

  return (
    <div className="space-y-4">
      <div>
        {blossomServers.length === 0 ? (
          <p className="text-muted-foreground">{t('settings.blossom.noServers')}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('settings.blossom.uploadHint', {
                defaultValue:
                  'Checked servers get your uploads. Unchecked ones stay in the list so videos stored there are still found.',
              })}
            </p>
            <ScrollArea className="w-full rounded-md border p-4">
              <ul className="space-y-2">
                {blossomServers.map(server => (
                  <li key={server.url} className="flex items-center justify-between gap-2 text-sm">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={server.upload !== false}
                        // The last active server stays on: an upload needs somewhere to go.
                        disabled={server.upload !== false && activeCount === 1}
                        onCheckedChange={checked =>
                          handleToggleUpload(server.url, checked === true)
                        }
                        aria-label={t('settings.blossom.useForUploads', {
                          defaultValue: 'Upload to {{server}}',
                          server: server.name || server.url,
                        })}
                      />
                      <span
                        className={`truncate ${server.upload === false ? 'text-muted-foreground' : ''}`}
                      >
                        {server.name || server.url}
                      </span>
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveServer(server.url)}
                      aria-label={t('settings.blossom.remove', { defaultValue: 'Remove server' })}
                    >
                      <XIcon className="h-6 w-6" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </>
        )}
      </div>

      <div className="flex w-full space-x-2">
        <Input
          placeholder={t('settings.blossom.addPlaceholder')}
          value={newServerUrl}
          onChange={e => setNewServerUrl(e.target.value)}
          onKeyPress={e => {
            if (e.key === 'Enter') {
              handleAddServer()
            }
          }}
        />
        <Button onClick={handleAddServer}>{t('settings.blossom.addButton')}</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={handleUseDefaults}>
          {t('settings.blossom.resetButton')}
        </Button>
        {user && (
          <Button
            variant="outline"
            onClick={handlePublishList}
            disabled={isPublishing || blossomServers.length === 0}
          >
            {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settings.blossom.publishButton', {
              defaultValue: 'Publish list to Nostr profile',
            })}
          </Button>
        )}
      </div>

      {user && (
        <p className="text-xs text-muted-foreground">
          {profileDiffers
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
    </div>
  )
}
