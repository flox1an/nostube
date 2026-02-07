import { useState, useEffect, useMemo } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { TagInput } from '@/components/ui/tag-input'
import { Pencil, Loader2 } from 'lucide-react'
import { LanguageSelect } from '@/components/ui/language-select'
import { VideoVariantsList } from '@/components/edit-video/VideoVariantsList'
import { EventPreviewDiff } from '@/components/edit-video/EventPreviewDiff'
import { useNostrPublish } from '@/hooks'
import { useCurrentUser } from '@/hooks'
import { useAppContext } from '@/hooks'
import { parseImetaTag, type ParsedImeta } from '@/lib/imeta-builder'
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
  const { config } = useAppContext()

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

  // Variant management state
  const [imetaTags, setImetaTags] = useState<ParsedImeta[]>([])

  // Derive write relays
  const writeRelays = useMemo(
    () => relays || config.relays?.filter(r => r.tags.includes('write')).map(r => r.url) || [],
    [relays, config.relays]
  )

  // Derive video event info for mirror announcements
  const videoEventInfo = useMemo(() => {
    const dTag = videoEvent.tags.find(t => t[0] === 'd')?.[1]
    return {
      id: videoEvent.id,
      kind: videoEvent.kind,
      pubkey: videoEvent.pubkey,
      dTag,
    }
  }, [videoEvent])

  // Extract thumbnail URLs and blurhash from existing imeta tags
  const { thumbnailUrls, blurhash } = useMemo(() => {
    if (imetaTags.length === 0) return { thumbnailUrls: [], blurhash: undefined }
    const first = imetaTags[0]
    return {
      thumbnailUrls: first.thumbnailUrls || [],
      blurhash: first.blurhash,
    }
  }, [imetaTags])

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

      // Parse imeta tags
      const imetas = videoEvent.tags
        .filter(t => t[0] === 'imeta')
        .map(tag => parseImetaTag(tag))
        .filter((p): p is ParsedImeta => p !== null)
      setImetaTags(imetas)

      // (variant flow state is managed by VideoVariantsList internally)
    }
  }, [open, videoEvent])

  const handleVariantReplaced = (index: number, newTag: string[]) => {
    setImetaTags(prev => {
      const next = [...prev]
      const parsed = parseImetaTag(newTag)
      if (parsed) {
        next[index] = parsed
      }
      return next
    })
  }

  const handleVariantAdded = (newTag: string[]) => {
    const parsed = parseImetaTag(newTag)
    if (parsed) {
      setImetaTags(prev => [...prev, parsed])
    }
  }

  const handleVariantRemoved = (index: number) => {
    setImetaTags(prev => prev.filter((_, i) => i !== index))
  }

  /**
   * Build the updated event from current form state.
   * Extracted so it can be used for both preview and actual publish.
   */
  const buildUpdatedEvent = () => {
    // Preserve all tags EXCEPT the ones we're replacing
    const replacedTagKeys = ['title', 'alt', 't', 'L', 'l', 'content-warning', 'imeta']
    const preservedTags = videoEvent.tags.filter(tag => !replacedTagKeys.includes(tag[0]))

    // Get current imeta tags (mix of original preserved + newly built)
    const currentImetaTags = imetaTags.map(imeta => imeta.raw)

    // Check if any imeta tag was replaced by comparing serialized forms
    const originalImetaSerialized = new Set(
      videoEvent.tags.filter(t => t[0] === 'imeta').map(t => JSON.stringify(t))
    )
    const needsDurationUpdate = currentImetaTags.some(
      tag => !originalImetaSerialized.has(JSON.stringify(tag))
    )

    // If duration needs updating, remove it from preserved tags
    const finalPreservedTags = needsDurationUpdate
      ? preservedTags.filter(tag => tag[0] !== 'duration')
      : preservedTags

    // Determine kind based on first variant dimensions
    let kind = videoEvent.kind
    if (imetaTags.length > 0 && imetaTags[0].dimensions) {
      const [w, h] = imetaTags[0].dimensions.split('x').map(Number)
      if (w > 0 && h > 0) {
        const isAddressable = kind === 34235 || kind === 34236
        if (isAddressable) {
          kind = h > w ? 34236 : 34235
        }
      }
    }

    // Build new tags array
    const newTags: string[][] = [
      ...finalPreservedTags,
      ...currentImetaTags,
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

    return {
      kind,
      content: description.trim(),
      tags: newTags,
    }
  }

  // Compute preview event reactively for the diff view
  const previewEvent = useMemo(
    () => buildUpdatedEvent(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      imetaTags,
      title,
      description,
      tags,
      language,
      contentWarningEnabled,
      contentWarningReason,
      videoEvent,
    ]
  )

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
      const { kind, content, tags: newTags } = buildUpdatedEvent()

      const updatedEvent = {
        kind,
        content,
        created_at: nowInSecs(),
        tags: newTags,
      }

      await publish({ event: updatedEvent, relays: writeRelays })
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

  const hasImeta = imetaTags.length > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{t('editVideo.title')}</DialogTitle>
          <DialogDescription>{t('editVideo.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Video Files Section */}
            {hasImeta && (
              <>
                <VideoVariantsList
                  imetaTags={imetaTags}
                  onVariantReplaced={handleVariantReplaced}
                  onVariantAdded={handleVariantAdded}
                  onVariantRemoved={handleVariantRemoved}
                  thumbnailUrls={thumbnailUrls}
                  blurhash={blurhash}
                  writeRelays={writeRelays}
                  videoEventInfo={videoEventInfo}
                />
                <Separator />
              </>
            )}

            {/* Video Details Section */}
            <div className="space-y-4">
              {hasImeta && (
                <span className="text-sm font-medium">{t('editVideo.videoDetails')}</span>
              )}

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
          </div>
          {/* Event Preview Diff */}
          <EventPreviewDiff
            originalTags={videoEvent.tags}
            newTags={previewEvent.tags}
            originalKind={videoEvent.kind}
            newKind={previewEvent.kind}
            newContent={previewEvent.content}
          />

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
