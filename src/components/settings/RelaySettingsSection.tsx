import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext, useSelectedPreset } from '@/hooks'
import { type RelayTag } from '@/contexts/AppContext'
import { normalizeRelayUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XIcon, Cog } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { Badge } from '../ui/badge'

export function RelaySettingsSection() {
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

  // Calculate relay counts for NIP-65 size guideline
  const readRelayCount = config.relays.filter(r => r.tags.includes('read')).length
  const writeRelayCount = config.relays.filter(r => r.tags.includes('write')).length
  const showSizeWarning = readRelayCount > 4 || writeRelayCount > 4

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('settings.relays.description')}</p>

      {/* NIP-65 size guideline warning */}
      {showSizeWarning && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            <strong>NIP-65 Recommendation:</strong> Consider keeping your relay list small (2-4
            read, 2-4 write relays) for optimal performance and reliability.
            {readRelayCount > 4 && ` Currently: ${readRelayCount} read relays.`}
            {writeRelayCount > 4 && ` Currently: ${writeRelayCount} write relays.`}
          </p>
        </div>
      )}

      <div>
        {config.relays.length === 0 ? (
          <p className="text-muted-foreground">{t('settings.relays.noRelays')}</p>
        ) : (
          <ScrollArea className="w-full rounded-md border p-4">
            <ul className="space-y-2">
              {config.relays.map(relay => (
                <li key={relay.url} className="flex items-center justify-between text-sm">
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2 mt-1">
                      <span>{relay.name || relay.url}</span>
                      {(relay.tags || []).map(tag => (
                        <Badge key={tag} variant={tag == 'write' ? 'default' : 'outline'}>
                          {' '}
                          {t(`settings.relays.${tag}`)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('settings.relays.editTags')}
                        >
                          <span className="sr-only">{t('settings.relays.editTags')}</span>
                          <Cog className="h-6 w-6" />
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
      </div>

      <div className="flex w-full space-x-2">
        <Input
          placeholder={t('settings.relays.addPlaceholder')}
          value={newRelayUrl}
          onChange={e => setNewRelayUrl(e.target.value)}
          onKeyPress={e => {
            if (e.key === 'Enter') {
              handleAddRelay()
            }
          }}
        />
        <Button onClick={handleAddRelay}>{t('settings.relays.addButton')}</Button>
      </div>

      <Button variant="outline" onClick={handleResetRelays}>
        {t('settings.relays.resetButton')}
      </Button>
    </div>
  )
}
