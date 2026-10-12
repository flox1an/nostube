import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Eye, EyeOff, FileVideo, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { EventTemplate, NostrEvent } from 'nostr-tools'
import type { VideoEvent } from '@nostube/core/video-event'
import { buildVideoDeletion } from '@nostube/core/video-lifecycle'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@nostube/widgets/components/alert-dialog'
import { Button } from '@nostube/widgets/components/button'
import { Dialog, DialogContent, DialogTitle } from '@nostube/widgets/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@nostube/widgets/components/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@nostube/widgets/components/tooltip'
import { useSigner } from './signer-context'
import type { InstanceClient } from './instance-client'
import { VideoEditor } from './VideoEditor'
import { publishVideoChange } from './upload/publish-video-change'

/**
 * A video row's actions: View on site, an Edit button and a menu (replace, hide/show on the site,
 * delete). Edit, replace and delete are offered to the video's author only; hiding is a site
 * setting.
 */
export function VideoActions({
  video,
  instance,
  hidden,
  onHiddenChange,
  hideBusy,
}: {
  video: VideoEvent
  instance: InstanceClient
  hidden: boolean
  onHiddenChange: (hidden: boolean) => void
  hideBusy: boolean
}) {
  const { t } = useTranslation()
  const { signer, pubkey } = useSigner()
  const [editing, setEditing] = useState<{ event: NostrEvent; replace: boolean } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)
  // The video's author only; anyone else may still hide it from the site.
  const author =
    signer &&
    pubkey !== null &&
    pubkey === video.pubkey &&
    (video.kind === 34235 || video.kind === 34236) &&
    video.identifier !== undefined
      ? { signer, pubkey }
      : null
  const canEdit = author !== null
  const publish = (template: EventTemplate) => {
    if (!author) throw new Error('authorMismatch')
    return publishVideoChange(instance, author.signer, author.pubkey, template)
  }

  const getCurrent = () => {
    const event = instance.client.eventStore.getReplaceable(
      video.kind,
      video.pubkey,
      video.identifier
    )
    if (!event) throw new Error('eventMissing')
    return event
  }
  const showError = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    setError(
      ['authorMismatch', 'notAddressable', 'eventMissing'].includes(message)
        ? t(`studio.videos.${message}`)
        : message
    )
  }
  const edit = (replace: boolean) => {
    setError(null)
    try {
      setEditing({ event: getCurrent(), replace })
    } catch (e) {
      showError(e)
    }
  }
  const remove = async () => {
    if (busy.current) return
    busy.current = true
    setRunning(true)
    setError(null)
    try {
      await publish(buildVideoDeletion(getCurrent(), video.pubkey))
      setConfirming(false)
    } catch (e) {
      showError(e)
    } finally {
      busy.current = false
      setRunning(false)
    }
  }
  const errorText = error && (
    <p role="alert" className="w-full text-sm text-destructive">
      {error}
    </p>
  )
  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon">
              <a
                href={`/v/${video.link}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('studio.videos.viewOnSite')}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('studio.videos.viewOnSite')}</TooltipContent>
        </Tooltip>
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('studio.videos.edit')}
                onClick={() => edit(false)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('studio.videos.edit')}</TooltipContent>
          </Tooltip>
        )}
        {/* Not modal: the dialogs its items open take the focus over. */}
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('studio.videos.moreActions')}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('studio.videos.moreActions')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem onSelect={() => edit(true)}>
                <FileVideo className="mr-2 h-4 w-4" />
                {t('studio.videos.replace')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={hideBusy} onSelect={() => onHiddenChange(!hidden)}>
              {hidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
              {t(hidden ? 'studio.videos.showOnSite' : 'studio.videos.hideOnSite')}
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    setError(null)
                    setConfirming(true)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('studio.videos.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!confirming && errorText}
      {/* Closed only by the editor itself: a stray click or Escape must not drop a running upload. */}
      <Dialog open={editing !== null}>
        <DialogContent
          hideCloseButton
          aria-describedby={undefined}
          className="max-h-[90vh] overflow-y-auto pb-0 sm:max-w-2xl"
          onEscapeKeyDown={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogTitle>
            {t(editing?.replace ? 'studio.videos.replace' : 'studio.videos.edit')}
          </DialogTitle>
          {editing && (
            <VideoEditor
              event={editing.event}
              getCurrent={getCurrent}
              publish={publish}
              replace={editing.replace}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirming}
        onOpenChange={open => {
          if (open || running) return
          setConfirming(false)
          setError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('studio.videos.deleteConfirm', { title: video.title })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('studio.videos.deleteHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          {errorText}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>{t('studio.videos.cancel')}</AlertDialogCancel>
            {/* A plain button: the dialog stays open while deleting and to retry after a refusal. */}
            <Button
              type="button"
              variant="destructive"
              disabled={running}
              onClick={() => void remove()}
            >
              {running ? t('studio.videos.deleting') : t('studio.videos.confirmDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
