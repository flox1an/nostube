import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ServerCard } from './ServerCard'
import { RECOMMENDED_BLOSSOM_SERVERS } from '@/lib/blossom-servers'

interface BlossomServerPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  excludeServers: string[] // Already-added servers to filter out
  onSelect: (url: string) => void
  type: 'upload' | 'mirror' // For i18n context
}

export function BlossomServerPicker({
  open,
  onOpenChange,
  excludeServers,
  onSelect,
  type,
}: BlossomServerPickerProps) {
  const { t } = useTranslation()
  const [customUrl, setCustomUrl] = useState('')

  // Filter out already-added servers
  const availableServers = RECOMMENDED_BLOSSOM_SERVERS.filter(
    server => !excludeServers.includes(server.url)
  )

  const handleCustomAdd = () => {
    if (customUrl.trim()) {
      onSelect(customUrl.trim())
      setCustomUrl('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(`blossomPicker.${type}.title`)}</DialogTitle>
          <DialogDescription>{t(`blossomPicker.${type}.description`)}</DialogDescription>
        </DialogHeader>

        {/* Recommended Servers List */}
        <ScrollArea className="h-96 rounded-md border p-3">
          <div className="space-y-2">
            {availableServers.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {t('blossomPicker.noServersAvailable')}
              </div>
            ) : (
              availableServers.map(server => (
                <div
                  key={server.url}
                  onClick={() => onSelect(server.url)}
                  className="cursor-pointer hover:bg-accent rounded transition-colors"
                >
                  <ServerCard server={server} selectable />
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Custom URL Input */}
        <div className="space-y-2 pt-4 border-t">
          <Label>{t('blossomPicker.customUrl.label')}</Label>
          <div className="flex gap-2">
            <Input
              placeholder={t('blossomPicker.customUrl.placeholder')}
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
            />
            <Button onClick={handleCustomAdd} disabled={!customUrl.trim()}>
              {t('blossomPicker.customUrl.add')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('blossomPicker.customUrl.hint')}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
