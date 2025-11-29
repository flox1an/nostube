import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tag, Loader2 } from 'lucide-react'
import { useNostrPublish } from '@/hooks'
import { useCurrentUser } from '@/hooks'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import type { NostrEvent } from 'nostr-tools'

// Common ISO-639-1 language codes
const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
  { code: 'ko', name: '한국어' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'tr', name: 'Türkçe' },
]

interface LabelVideoDialogProps {
  videoEvent: NostrEvent
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function LabelVideoDialog({
  videoEvent,
  trigger,
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
  const [hashtags, setHashtags] = useState('')
  const [language, setLanguage] = useState('')
  const [explanation, setExplanation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      toast.error(t('labelVideo.loginRequired'))
      return
    }

    const hashtagList = hashtags
      .split(',')
      .map(tag => tag.trim().toLowerCase().replace(/^#/, ''))
      .filter(tag => tag.length > 0)

    if (hashtagList.length === 0 && !language) {
      toast.error(t('labelVideo.noLabelsError'))
      return
    }

    setIsSubmitting(true)

    try {
      const tags: string[][] = []

      // Add hashtag labels
      if (hashtagList.length > 0) {
        tags.push(['L', '#t'])
        hashtagList.forEach(tag => {
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
      setHashtags('')
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
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="cursor-pointer">
            <Tag className="h-4 w-4 mr-1" />
            {t('labelVideo.button')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('labelVideo.title')}</DialogTitle>
          <DialogDescription>{t('labelVideo.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Hashtags Input */}
            <div className="space-y-2">
              <Label htmlFor="hashtags">{t('labelVideo.hashtagsLabel')}</Label>
              <Input
                id="hashtags"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                placeholder={t('labelVideo.hashtagsPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('labelVideo.hashtagsHelp')}</p>
            </div>

            {/* Language Select */}
            <div className="space-y-2">
              <Label htmlFor="language">{t('labelVideo.languageLabel')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language">
                  <SelectValue placeholder={t('labelVideo.languagePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map(lang => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name} ({lang.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={isSubmitting || (!hashtags.trim() && !language)}
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
