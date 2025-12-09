import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BlossomServerInfo } from '@/lib/blossom-servers'
import { Check } from 'lucide-react'

interface ServerCardProps {
  server: BlossomServerInfo
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function ServerCard({ server, checked, onCheckedChange }: ServerCardProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer',
        checked && 'border-purple-500 bg-purple-500/5'
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <Checkbox
        id={server.url}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5"
        onClick={e => e.stopPropagation()}
      />
      <div className="flex-1 space-y-1.5">
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
      </div>
    </div>
  )
}
