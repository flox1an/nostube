import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@nostube/widgets/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@nostube/widgets/components/tooltip'
import { useGroupPerDay } from '@/hooks/useGroupPerDay'

/** Toggle for the one-video-per-creator-per-day grouping in feeds. */
export function GroupPerDayButton() {
  const { t } = useTranslation()
  const [grouped, setGrouped] = useGroupPerDay()
  const label = t(grouped ? 'pages.home.groupPerDayOn' : 'pages.home.groupPerDayOff')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-11 min-w-11 shrink-0 gap-1.5 px-2 ${grouped ? 'text-muted-foreground' : 'text-foreground'}`}
          aria-label={label}
          aria-pressed={grouped}
          onClick={() => setGrouped(!grouped)}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>
            {t(grouped ? 'pages.home.groupPerDayOnShort' : 'pages.home.groupPerDayOffShort')}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
