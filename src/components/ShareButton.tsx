import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Clock,
  Mail,
  Send,
  Twitter,
  Globe,
  Facebook,
  Share2,
  Link as LinkIcon,
  Code,
} from 'lucide-react'
import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export interface ShareButtonProps {
  shareOpen: boolean
  setShareOpen: (open: boolean) => void
  shareUrl: string
  includeTimestamp: boolean
  setIncludeTimestamp: (v: boolean) => void
  shareLinks: {
    mailto: string
    whatsapp: string
    x: string
    reddit: string
    facebook: string
    pinterest: string
  }
}

const ShareButton: React.FC<ShareButtonProps> = ({
  shareOpen,
  setShareOpen,
  shareUrl,
  includeTimestamp,
  setIncludeTimestamp,
  shareLinks,
}) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('link')

  // Extract video ID from shareUrl (e.g., /v/nevent1... -> nevent1...)
  const videoId = useMemo(() => {
    const match = shareUrl.match(/\/video\/([^?]+)/)
    return match ? match[1] : ''
  }, [shareUrl])

  // Generate embed code
  const embedCode = useMemo(() => {
    if (!videoId) return ''

    // Get base URL from shareUrl (e.g., https://nostu.be)
    const baseUrl = shareUrl.split('/video/')[0]

    // Build embed URL with video ID
    let embedUrl = `${baseUrl}/embed.html?v=${videoId}`

    // Add timestamp if enabled and present in shareUrl
    if (includeTimestamp && shareUrl.includes('?t=')) {
      const timeMatch = shareUrl.match(/[?&]t=(\d+)/)
      if (timeMatch) {
        embedUrl += `&t=${timeMatch[1]}`
      }
    }

    return `<iframe
  src="${embedUrl}"
  width="640"
  height="360"
  frameborder="0"
  allowfullscreen
  allow="autoplay; fullscreen"
></iframe>`
  }, [videoId, shareUrl, includeTimestamp])

  return (
    <Dialog open={shareOpen} onOpenChange={setShareOpen}>
      <DialogTrigger asChild>
        <Button
          title={t('video.share.title')}
          aria-label={t('video.share.title')}
          variant="secondary"
        >
          <LinkIcon className="w-6 h-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('video.share.title')}</DialogTitle>
          <DialogDescription>{t('video.share.description')}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">
              <LinkIcon className="w-4 h-4 mr-2" />
              {t('video.share.linkTab')}
            </TabsTrigger>
            <TabsTrigger value="embed">
              <Code className="w-4 h-4 mr-2" />
              {t('video.share.embedTab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 text-xs"
                onFocus={e => e.target.select()}
              />
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl)
                }}
              >
                {t('common.copy')}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="timestamp-checkbox"
                checked={includeTimestamp}
                onCheckedChange={checked => setIncludeTimestamp(!!checked)}
              />
              <label
                htmlFor="timestamp-checkbox"
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <Clock className="w-4 h-4" />
                <span>{t('video.share.includeTimestamp')}</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-4 justify-center mt-2">
              <a
                href={shareLinks.mailto}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.share.viaEmail')}
              >
                <Mail className="w-7 h-7" />
              </a>
              <a
                href={shareLinks.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.share.onWhatsapp')}
              >
                <Send className="w-7 h-7" />
              </a>
              <a
                href={shareLinks.x}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.share.onX')}
              >
                <Twitter className="w-7 h-7" />
              </a>
              <a
                href={shareLinks.reddit}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.share.onReddit')}
              >
                <Globe className="w-7 h-7" />
              </a>
              <a
                href={shareLinks.facebook}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.share.onFacebook')}
              >
                <Facebook className="w-7 h-7" />
              </a>
              <a
                href={shareLinks.pinterest}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.share.onPinterest')}
              >
                <Share2 className="w-7 h-7" />
              </a>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('video.share.embedCode')}</label>
              <Textarea
                value={embedCode}
                readOnly
                rows={7}
                className="font-mono text-xs"
                onFocus={e => e.target.select()}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(embedCode)
                }}
              >
                {t('video.share.copyEmbed')}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="embed-timestamp-checkbox"
                checked={includeTimestamp}
                onCheckedChange={checked => setIncludeTimestamp(!!checked)}
              />
              <label
                htmlFor="embed-timestamp-checkbox"
                className="flex items-center gap-2 cursor-pointer select-none text-sm"
              >
                <Clock className="w-4 h-4" />
                <span>{t('video.share.includeTimestamp')}</span>
              </label>
            </div>

            <div className="text-xs text-muted-foreground">{t('video.share.embedDescription')}</div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export default ShareButton
