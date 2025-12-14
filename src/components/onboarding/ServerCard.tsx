import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BlossomServerInfo } from '@/lib/blossom-servers'
import { Check, X, HardDrive } from 'lucide-react'

interface ServerCardProps {
  server: BlossomServerInfo

  // Existing (keep for backward compatibility)
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void

  // New modes
  selectable?: boolean // Shows hover effect, for picker (click handled by parent)
  showDetailsOnHover?: boolean // Progressive disclosure in modal
  onRemove?: () => void // Shows remove button, for onboarding step list
}

export function ServerCard({
  server,
  checked,
  onCheckedChange,
  selectable,
  showDetailsOnHover,
  onRemove,
}: ServerCardProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-3 rounded-lg border bg-card transition-colors relative',
        onCheckedChange && 'cursor-pointer hover:bg-accent/50',
        checked && 'border-purple-500 bg-purple-500/5',
        selectable && 'hover:bg-accent'
      )}
      onClick={() => onCheckedChange && onCheckedChange(!checked)}
    >
      {onCheckedChange && (
        <Checkbox
          id={server.url}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5"
          onClick={e => e.stopPropagation()}
        />
      )}
      <div className="flex-1 space-y-1.5">
        {showDetailsOnHover ? (
          <>
            {/* Minimal info always visible */}
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor={server.url} className="font-medium text-sm cursor-pointer">
                {server.name}
              </label>
              <Badge
                variant={server.payment === 'free' ? 'secondary' : 'default'}
                className={cn(
                  'text-xs',
                  server.payment === 'paid' && 'bg-orange-500 hover:bg-orange-500/90'
                )}
              >
                {t(`onboarding.blossom.serverInfo.${server.payment}`)}
              </Badge>
            </div>

            {/* Details revealed on hover using group-hover */}
            <div className="hidden group-hover:block transition-all text-xs text-muted-foreground space-y-0.5">
              {server.supportsMirror && (
                <div className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-green-500" />
                  <span>
                    {t('onboarding.blossom.serverInfo.supportsMirror')}
                    {server.cdnProvider && ` • ${server.cdnProvider}`}
                  </span>
                </div>
              )}
              {!server.supportsMirror && server.cdnProvider && (
                <div className="flex items-center gap-1.5">
                  <span>{server.cdnProvider}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3 w-3" />
                <span>
                  {server.maxFileSize || t('onboarding.blossom.serverInfo.noLimit')}
                  {' • '}
                  {server.retention || t('onboarding.blossom.serverInfo.unlimited')}
                  {server.price && ` • ${server.price}`}
                </span>
              </div>
            </div>
          </>
        ) : (
          // Full details always visible (current behavior)
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor={server.url} className="font-medium text-sm cursor-pointer">
                {server.name}
              </label>
              <Badge
                variant={server.payment === 'free' ? 'secondary' : 'default'}
                className={cn(
                  'text-xs',
                  server.payment === 'paid' && 'bg-orange-500 hover:bg-orange-500/90'
                )}
              >
                {t(`onboarding.blossom.serverInfo.${server.payment}`)}
              </Badge>
            </div>

            <div className="text-xs text-muted-foreground space-y-0.5">
              {server.supportsMirror && (
                <div className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-green-500" />
                  <span>
                    {t('onboarding.blossom.serverInfo.supportsMirror')}
                    {server.cdnProvider && ` • ${server.cdnProvider}`}
                  </span>
                </div>
              )}
              {!server.supportsMirror && server.cdnProvider && (
                <div className="flex items-center gap-1.5">
                  <span>{server.cdnProvider}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span>📦</span>
                <span>
                  {server.maxFileSize || t('onboarding.blossom.serverInfo.noLimit')}
                  {' • '}
                  {server.retention || t('onboarding.blossom.serverInfo.unlimited')}
                  {server.price && ` • ${server.price}`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
