import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { TagInput } from '@/components/ui/tag-input'
import { Pencil, Loader2 } from 'lucide-react'
import { LanguageSelect } from '@/components/ui/language-select'
import { useNostrPublish } from '@/hooks'
import { useCurrentUser } from '@/hooks'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { nowInSecs } from '@/lib/utils'
import type { NostrEvent } from 'nostr-tools'

interface EditVideoDialogProps {
  videoEvent: NostrEvent
  relays?: string[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
}

export function EditVideoDialog({
  videoEvent,
  relays,
  open: controlledOpen,
  onOpenChange,
  onSuccess,
}: EditVideoDialogProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? onOpenChange! : setInternalOpen

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [language, setLanguage] = useState('')
  const [contentWarningEnabled, setContentWarningEnabled] = useState(false)
  const [contentWarningReason, setContentWarningReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Parse existing event data when dialog opens
  useEffect(() => {
    if (open && videoEvent) {
      // Extract title
      const titleTag = videoEvent.tags.find(t => t[0] === 'title')
      setTitle(titleTag?.[1] || '')

      // Extract description from content
      setDescription(videoEvent.content || '')

      // Extract hashtags
      const hashtagTags = videoEvent.tags.filter(t => t[0] === 't')
      setTags(hashtagTags.map(t => t[1]))

      // Extract content warning
      const contentWarningTag = videoEvent.tags.find(t => t[0] === 'content-warning')
      if (contentWarningTag) {
        setContentWarningEnabled(true)
        setContentWarningReason(contentWarningTag[1] || '')
      } else {
        setContentWarningEnabled(false)
        setContentWarningReason('')
      }

      // Extract language (l tag with ISO-639-1 namespace)
      const languageTag = videoEvent.tags.find(t => t[0] === 'l' && t[2] === 'ISO-639-1')
      setLanguage(languageTag?.[1] || '')
    }
  }, [open, videoEvent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      toast.error(t('editVideo.loginRequired'))
      return
    }

    if (!title.trim()) {
      toast.error(t('editVideo.titleRequired'))
      return
    }

    setIsSubmitting(true)

    try {
      // Preserve all tags EXCEPT the ones we're replacing (for future compatibility)
      // We replace: title, alt, t (hashtags), L, l (language), content-warning
      const replacedTagKeys = ['title', 'alt', 't', 'L', 'l', 'content-warning']
      const preservedTags = videoEvent.tags.filter(tag => !replacedTagKeys.includes(tag[0]))

      // Build new tags array
      const newTags: string[][] = [
        ...preservedTags,
        ['title', title.trim()],
        ['alt', description.trim() || title.trim()],
        ...tags.map(tag => ['t', tag]),
        ...(language
          ? [
              ['L', 'ISO-639-1'],
              ['l', language, 'ISO-639-1'],
            ]
          : []),
        ...(contentWarningEnabled
          ? [['content-warning', contentWarningReason.trim() || 'NSFW']]
          : []),
      ]

      // Create the updated event
      const updatedEvent = {
        kind: videoEvent.kind,
        content: description.trim(),
        created_at: nowInSecs(),
        tags: newTags,
      }

      await publish({ event: updatedEvent, relays })
      toast.success(t('editVideo.success'))
      setOpen(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to update video:', error)
      toast.error(t('editVideo.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('editVideo.title')}</DialogTitle>
          <DialogDescription>{t('editVideo.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Title Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t('editVideo.titleLabel')}</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('editVideo.titlePlaceholder')}
                required
              />
            </div>

            {/* Description Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">{t('editVideo.descriptionLabel')}</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('editVideo.descriptionPlaceholder')}
                rows={4}
              />
            </div>

            {/* Tags Input */}
            <div className="space-y-2">
              <Label htmlFor="edit-tags">{t('editVideo.tagsLabel')}</Label>
              <TagInput
                id="edit-tags"
                tags={tags}
                onTagsChange={setTags}
                placeholder={t('editVideo.tagsPlaceholder')}
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label htmlFor="edit-language">{t('editVideo.languageLabel')}</Label>
              <LanguageSelect
                id="edit-language"
                value={language}
                onValueChange={setLanguage}
                placeholder={t('editVideo.languagePlaceholder')}
                allowNone
                noneLabel={t('common.notSet')}
              />
            </div>

            {/* Content Warning */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-content-warning"
                  checked={contentWarningEnabled}
                  onCheckedChange={checked => setContentWarningEnabled(checked === true)}
                />
                <Label htmlFor="edit-content-warning" className="cursor-pointer">
                  {t('editVideo.contentWarningLabel')}
                </Label>
              </div>
              {contentWarningEnabled && (
                <Input
                  value={contentWarningReason}
                  onChange={e => setContentWarningReason(e.target.value)}
                  placeholder={t('editVideo.contentWarningPlaceholder')}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="mr-2 h-4 w-4" />
              )}
              {t('editVideo.submitButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
