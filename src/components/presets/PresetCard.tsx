import { Check, User } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useProfile } from '@/hooks/useProfile'
import { type NostubePreset } from '@/types/preset'
import { cn } from '@/lib/utils'

interface PresetCardProps {
  preset: NostubePreset
  isSelected: boolean
  onClick: () => void
}

/**
 * Card component for displaying a preset in the browse list
 */
export function PresetCard({ preset, isSelected, onClick }: PresetCardProps) {
  const profile = useProfile({ pubkey: preset.pubkey })

  const ownerName = profile?.display_name || profile?.name || preset.pubkey.slice(0, 8) + '...'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-4 transition-colors',
        'hover:bg-accent hover:border-accent-foreground/20',
        isSelected && 'border-primary bg-primary/5'
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={profile?.picture} alt={ownerName} />
          <AvatarFallback>
            <User className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{preset.name}</h3>
            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
          </div>

          <p className="text-sm text-muted-foreground truncate">by {ownerName}</p>

          {preset.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{preset.description}</p>
          )}

          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
            <span>{preset.defaultRelays.length} relays</span>
            <span>{preset.blockedPubkeys.length} blocked</span>
            <span>{preset.nsfwPubkeys.length} NSFW</span>
          </div>
        </div>
      </div>
    </button>
  )
}
