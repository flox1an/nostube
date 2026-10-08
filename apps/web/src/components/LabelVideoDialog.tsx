import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { LanguageSelect } from '@/components/ui/language-select'
import { TagInput } from '@/components/ui/tag-input'
import { Tag, Loader2 } from 'lucide-react'
import { useNostrPublish } from '@/hooks'
import { useCurrentUser } from '@/hooks'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { NostrEvent } from 'nostr-tools'

interface LabelVideoDialogProps {
  videoEvent: NostrEvent
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function LabelVideoDialog({
  videoEvent,
  open: controlledOpen,
  onOpenChange,
}: LabelVideoDialogProps) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? onOpenChange! : setInternalOpen
  const [hashtags, setHashtags] = useState<string[]>([])
  const [language, setLanguage] = useState('')
  const [explanation, setExplanation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      toast.error(t('labelVideo.loginRequired'))
      return
    }

    if (hashtags.length === 0 && !language) {
      toast.error(t('labelVideo.noLabelsError'))
      return
    }

    setIsSubmitting(true)

    try {
      const tags: string[][] = []

      // Add hashtag labels
      if (hashtags.length > 0) {
        tags.push(['L', '#t'])
        hashtags.forEach(tag => {
          tags.push(['l', tag, '#t'])
        })
      }

      // Add language label
      if (language) {
        tags.push(['L', 'ISO-639-1'])
        tags.push(['l', language, 'ISO-639-1'])
      }

      // Add reference to the video event
      // Extract relay hint from the video event if available
      const relayHint = videoEvent.tags.find(t => t[0] === 'relay')?.[1] || ''
      tags.push(['e', videoEvent.id, relayHint])

      const labelEvent = {
        kind: 1985,
        content: explanation,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      }

      await publish({ event: labelEvent })
      toast.success(t('labelVideo.success'))
      setOpen(false)

      // Reset form
      setHashtags([])
      setLanguage('')
      setExplanation('')
    } catch (error) {
      console.error('Failed to publish label:', error)
      toast.error(t('labelVideo.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('labelVideo.title')}</DialogTitle>
          <DialogDescription>{t('labelVideo.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Hashtags Input */}
            <div className="space-y-2">
              <Label htmlFor="hashtags">{t('labelVideo.hashtagsLabel')}</Label>
              <TagInput
                id="hashtags"
                tags={hashtags}
                onTagsChange={setHashtags}
                placeholder={t('labelVideo.hashtagsPlaceholder')}
              />
            </div>

            {/* Language Select */}
            <div className="space-y-2">
              <Label htmlFor="language">{t('labelVideo.languageLabel')}</Label>
              <LanguageSelect
                id="language"
                value={language}
                onValueChange={setLanguage}
                placeholder={t('labelVideo.languagePlaceholder')}
              />
            </div>

            {/* Optional Explanation */}
            <div className="space-y-2">
              <Label htmlFor="explanation">{t('labelVideo.explanationLabel')}</Label>
              <Textarea
                id="explanation"
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                placeholder={t('labelVideo.explanationPlaceholder')}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{t('labelVideo.explanationHelp')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting || (hashtags.length === 0 && !language)}
              className="cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Tag className="mr-2 h-4 w-4" />
              )}
              {t('labelVideo.submitButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
