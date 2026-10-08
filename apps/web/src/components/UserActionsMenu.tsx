import { useState } from 'react'
import { Ban, EyeOff, Flag, MoreVertical, VideoOff, Volume2, VolumeX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ReportDialog } from '@/components/ReportDialog'
import { useCurrentUser } from '@/hooks'
import { useMuteUser } from '@/hooks/useMuteUser'
import { useMyPreset, type PresetFormData } from '@/hooks/useMyPreset'
import { usePresetBuffer } from '@/hooks/usePresetBuffer'
import { type NostubePreset, type PresetBufferList, DEFAULT_PRESET_PUBKEY } from '@/types/preset'
import { cn } from '@/lib/utils'

interface UserActionsMenuProps {
  /** Account the actions apply to. Mute always targets the account. */
  pubkey: string
  /** Set on video surfaces: the report then targets that video instead of the account. */
  videoId?: string
  /** Video title, recorded as review context in the admin moderation buffer. */
  videoTitle?: string
  className?: string
}

/**
 * Overflow menu with the moderation actions a viewer needs on someone else's
 * content: mute the account, or report what they are looking at.
 */
export function UserActionsMenu({ pubkey, videoId, videoTitle, className }: UserActionsMenuProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const [showReportDialog, setShowReportDialog] = useState(false)

  // Both actions need a signer, and neither makes sense on your own content.
  if (!user || user.pubkey === pubkey) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 w-8 p-0 text-muted-foreground hover:bg-muted', className)}
            aria-label={t('mute.moreActions', { defaultValue: 'More actions' })}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* Radix mounts the content on open, so the mute list is only observed then. */}
        <DropdownMenuContent align="end">
          <MuteMenuItem pubkey={pubkey} />
          <DropdownMenuItem onSelect={() => setShowReportDialog(true)}>
            <Flag className="w-4 h-4 mr-2" />
            {videoId
              ? t('video.reportVideo')
              : t('report.reportUser', { defaultValue: 'Report user' })}
          </DropdownMenuItem>
          {user.pubkey === DEFAULT_PRESET_PUBKEY && (
            <AdminPresetItems pubkey={pubkey} videoId={videoId} videoTitle={videoTitle} />
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        reportType={videoId ? 'video' : 'profile'}
        contentId={videoId ?? pubkey}
        contentAuthor={pubkey}
      />
    </>
  )
}

function MuteMenuItem({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { isMuted, toggleMute } = useMuteUser(pubkey)

  return (
    <DropdownMenuItem
      onSelect={() => void toggleMute()}
      className={isMuted ? undefined : 'text-destructive'}
    >
      {isMuted ? <Volume2 className="w-4 h-4 mr-2" /> : <VolumeX className="w-4 h-4 mr-2" />}
      {isMuted
        ? t('mute.unmuteUser', { defaultValue: 'Unmute user' })
        : t('video.comments.muteUser')}
    </DropdownMenuItem>
  )
}

/** Icon + i18n keys per moderation target list. */
const ADMIN_ITEMS: Record<PresetBufferList, { add: string; remove: string; icon: typeof Ban }> = {
  nsfwPubkeys: {
    add: 'presetModeration.nsfwAdd',
    remove: 'presetModeration.nsfwRemove',
    icon: EyeOff,
  },
  blockedPubkeys: {
    add: 'presetModeration.blockedAdd',
    remove: 'presetModeration.blockedRemove',
    icon: Ban,
  },
  blockedEvents: {
    add: 'presetModeration.videoAdd',
    remove: 'presetModeration.videoRemove',
    icon: VideoOff,
  },
}

/** PresetFormData copy of the preset with `value` removed from `list`. */
function withoutPresetEntry(
  preset: NostubePreset,
  list: PresetBufferList,
  value: string
): PresetFormData {
  return {
    name: preset.name,
    description: preset.description || '',
    defaultRelays: preset.defaultRelays,
    defaultBlossomProxy: preset.defaultBlossomProxy || '',
    blockedPubkeys:
      list === 'blockedPubkeys'
        ? preset.blockedPubkeys.filter(v => v !== value)
        : preset.blockedPubkeys,
    nsfwPubkeys:
      list === 'nsfwPubkeys' ? preset.nsfwPubkeys.filter(v => v !== value) : preset.nsfwPubkeys,
    blockedEvents:
      list === 'blockedEvents'
        ? preset.blockedEvents.filter(v => v !== value)
        : preset.blockedEvents,
  }
}

/**
 * Admin-only moderation targets, shown below the viewer actions. Removing an
 * entry from a list publishes the preset change immediately; adding only
 * stages into the local buffer that /admin applies in bulk.
 */
function AdminPresetItems({
  pubkey,
  videoId,
  videoTitle,
}: {
  pubkey: string
  videoId?: string
  videoTitle?: string
}) {
  const { t } = useTranslation()
  const { preset, savePreset } = useMyPreset()
  const { addEntry, has } = usePresetBuffer()

  const targets: Array<{ list: PresetBufferList; value: string }> = [
    { list: 'nsfwPubkeys', value: pubkey },
    { list: 'blockedPubkeys', value: pubkey },
  ]
  if (videoId) targets.push({ list: 'blockedEvents', value: videoId })

  const removeFromList = async (list: PresetBufferList, value: string) => {
    if (!preset) return
    try {
      await savePreset(withoutPresetEntry(preset, list, value))
      toast.success(t('presetModeration.removedToast'))
    } catch (err) {
      console.error('Failed to update preset:', err)
      toast.error(t('presetModeration.removeFailedToast'))
    }
  }

  return (
    <>
      <DropdownMenuSeparator />
      {targets.map(({ list, value }) => {
        const { add, remove, icon: Icon } = ADMIN_ITEMS[list]
        const inList = !!preset && preset[list].includes(value)
        const buffered = has(value)
        return (
          <DropdownMenuItem
            key={list}
            onSelect={() => {
              if (inList) void removeFromList(list, value)
              else if (!buffered) addEntry(value, list, videoTitle)
            }}
            disabled={!inList && buffered}
            className={inList ? undefined : 'text-destructive'}
          >
            <Icon className="w-4 h-4 mr-2" />
            {inList ? t(remove) : t(add)}
            {!inList && buffered && (
              <span className="ml-auto pl-4 text-xs text-muted-foreground">
                {t('presetModeration.buffered')}
              </span>
            )}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
