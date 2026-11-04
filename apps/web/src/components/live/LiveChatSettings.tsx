import { useState } from 'react'
import { ExternalLink, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@nostube/widgets/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nostube/widgets/components/dropdown-menu'
import { Switch } from '@nostube/widgets/components/switch'
import { DEFAULT_CHAT_APPEARANCE, type ChatAppearance } from './chat-appearance'

export function LiveChatSettings({
  naddr,
  appearance,
  onChange,
}: {
  naddr: string
  appearance: ChatAppearance
  onChange: (value: ChatAppearance) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t('liveChat.settings', 'Chat settings')}
          >
            <Settings2 className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuItem
            onSelect={() => {
              const popup = window.open(
                `/live/${naddr}/chat`,
                `nostube-chat-${naddr}`,
                'popup,width=420,height=760'
              )
              setPopupBlocked(!popup)
              popup?.focus()
            }}
          >
            <ExternalLink className="mr-2 size-4" />
            {t('liveChat.popout', 'Pop-out chat')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestAnimationFrame(() => setOpen(true))}>
            {t('liveChat.appearance', 'Chat appearance')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm space-y-4">
          <DialogHeader>
            <DialogTitle>{t('liveChat.appearance', 'Chat appearance')}</DialogTitle>
            <DialogDescription>
              {t('liveChat.appearanceHint', 'Customize how messages look on this device.')}
            </DialogDescription>
          </DialogHeader>
          <div
            className="rounded-lg bg-muted p-3 leading-relaxed wrap-anywhere"
            style={{ fontSize: appearance.fontSize }}
          >
            {appearance.timestamps && <span className="mr-2 text-muted-foreground">12:34</span>}
            <span
              className={
                appearance.coloredNames
                  ? 'font-semibold text-violet-700 dark:text-violet-300'
                  : 'font-semibold'
              }
            >
              nostube
            </span>
            : {t('liveChat.preview', 'Hello, chat! ⚡')}
          </div>
          <label className="block space-y-2 text-sm">
            <span className="flex justify-between">
              <span>{t('liveChat.fontSize', 'Font size')}</span>
              <span>{appearance.fontSize}px</span>
            </span>
            <input
              aria-label={t('liveChat.fontSize', 'Font size')}
              type="range"
              min="12"
              max="18"
              step="2"
              value={appearance.fontSize}
              onChange={event => onChange({ ...appearance, fontSize: Number(event.target.value) })}
              className="h-8 w-full accent-primary"
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
            <span>{t('liveChat.coloredNames', 'Colored names')}</span>
            <Switch
              checked={appearance.coloredNames}
              onCheckedChange={coloredNames => onChange({ ...appearance, coloredNames })}
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
            <span>{t('liveChat.timestamps', 'Timestamps')}</span>
            <Switch
              checked={appearance.timestamps}
              onCheckedChange={timestamps => onChange({ ...appearance, timestamps })}
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
            <span>
              {t('liveChat.hideMuted', 'Hide muted accounts')}
              <span className="block text-xs text-muted-foreground">
                {t('liveChat.hideMutedHint', 'Your mute list and the streamer’s')}
              </span>
            </span>
            <Switch
              checked={appearance.hideMuted}
              onCheckedChange={hideMuted => onChange({ ...appearance, hideMuted })}
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
            <span>{t('liveChat.showTrust', 'Show trust badges')}</span>
            <Switch
              checked={appearance.showTrust}
              onCheckedChange={showTrust => onChange({ ...appearance, showTrust })}
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm">
            <span>
              {t('liveChat.minTrust', 'Minimum trust')}
              <span className="block text-xs text-muted-foreground">
                {t('liveChat.minTrustHint', 'Web of Trust score; unscored accounts stay visible')}
              </span>
            </span>
            <select
              aria-label={t('liveChat.minTrust', 'Minimum trust')}
              value={appearance.minTrust}
              onChange={event => onChange({ ...appearance, minTrust: Number(event.target.value) })}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value={0}>{t('liveChat.trustOff', 'Off')}</option>
              <option value={0.2}>20 %</option>
              <option value={0.4}>40 %</option>
              <option value={0.7}>70 %</option>
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onChange(DEFAULT_CHAT_APPEARANCE)}
          >
            {t('liveChat.resetAppearance', 'Reset appearance')}
          </Button>
        </DialogContent>
      </Dialog>
      {popupBlocked && (
        <p role="alert" className="text-xs text-destructive">
          {t(
            'liveChat.popupBlocked',
            'Allow pop-ups for Nostube to open chat in a separate window.'
          )}
        </p>
      )}
    </>
  )
}
