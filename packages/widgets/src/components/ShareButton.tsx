import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './dialog'
import { Input } from './input'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible'
import { Textarea } from './textarea'
import { Check, ChevronDown, Clock, Code, Globe, Mail, Pin, Send, Share2 } from 'lucide-react'
import { TwitterIcon, FacebookIcon } from './brand-icons'
import { cn } from '../cn'
import React, { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export interface ShareButtonProps {
  shareOpen: boolean
  setShareOpen: (open: boolean) => void
  shareUrl: string
  /** Title for the native share sheet (the video title). */
  shareTitle?: string
  /** Leave both out to hide the option (a page without a play position). */
  includeTimestamp?: boolean
  setIncludeTimestamp?: (v: boolean) => void
  shareLinks: {
    mailto: string
    whatsapp: string
    x: string
    reddit: string
    facebook: string
    pinterest: string
  }
  /** A visible text next to the icon: a small outline button for a row of labelled actions. */
  label?: string
  /** Extra trigger classes (merged last), e.g. a round media-overlay button. */
  className?: string
}

type CopyResult = { what: 'link' | 'embed'; ok: boolean } | null

const ShareButton: React.FC<ShareButtonProps> = ({
  shareOpen,
  setShareOpen,
  shareUrl,
  shareTitle,
  includeTimestamp = false,
  setIncludeTimestamp,
  shareLinks,
  label,
  className,
}) => {
  const { t } = useTranslation()
  const [embedOpen, setEmbedOpen] = useState(false)
  const [copyResult, setCopyResult] = useState<CopyResult>(null)

  useEffect(() => {
    if (!copyResult) return
    const timer = setTimeout(() => setCopyResult(null), 2500)
    return () => clearTimeout(timer)
  }, [copyResult])

  // navigator.clipboard is missing outside secure contexts and may reject (permissions):
  // report the real outcome instead of assuming success.
  const copy = async (what: 'link' | 'embed', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyResult({ what, ok: true })
    } catch {
      setCopyResult({ what, ok: false })
    }
  }

  // The native sheet (mobile, installed app) reaches every installed app. The trigger opens
  // it and the dialog together: sharing closes the dialog, cancelling (AbortError) or a failure
  // leaves the dialog as the fallback, which also holds the timestamp option and the embed code.
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const nativeShare = async () => {
    try {
      await navigator.share({ title: shareTitle, url: shareUrl })
      setShareOpen(false)
    } catch {
      // Cancelled or refused: not an error, the dialog stays open.
    }
  }

  // Both player routes share the same embed endpoint.
  const videoId = useMemo(() => {
    const match = shareUrl.match(/\/(?:v|video|short)\/([^?]+)/)
    return match ? match[1] : ''
  }, [shareUrl])

  // Generate embed code
  const embedCode = useMemo(() => {
    if (!videoId) return ''

    const baseUrl = new URL(shareUrl).origin

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

  const targets = [
    {
      href: shareLinks.mailto,
      name: t('video.share.email'),
      title: t('video.share.viaEmail'),
      Icon: Mail,
    },
    { href: shareLinks.whatsapp, name: 'WhatsApp', title: t('video.share.onWhatsapp'), Icon: Send },
    { href: shareLinks.x, name: 'X', title: t('video.share.onX'), Icon: TwitterIcon },
    { href: shareLinks.reddit, name: 'Reddit', title: t('video.share.onReddit'), Icon: Globe },
    {
      href: shareLinks.facebook,
      name: 'Facebook',
      title: t('video.share.onFacebook'),
      Icon: FacebookIcon,
    },
    {
      href: shareLinks.pinterest,
      name: 'Pinterest',
      title: t('video.share.onPinterest'),
      Icon: Pin,
    },
  ]

  const linkCopied = copyResult?.what === 'link' && copyResult.ok
  const embedCopied = copyResult?.what === 'embed' && copyResult.ok

  return (
    <Dialog open={shareOpen} onOpenChange={setShareOpen}>
      <DialogTrigger asChild>
        <Button
          title={t('video.share.title')}
          aria-label={t('video.share.title')}
          variant={label ? 'outline' : 'secondary'}
          size={label ? 'sm' : 'default'}
          className={className}
          onClick={canNativeShare ? () => void nativeShare() : undefined}
        >
          <Share2 aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{t('video.share.title')}</DialogTitle>
          <DialogDescription>{t('video.share.description')}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={shareUrl}
              readOnly
              aria-label={t('video.share.linkTab')}
              className="h-11 min-w-0 flex-1 text-xs sm:h-10"
              onFocus={e => e.target.select()}
            />
            <Button className="h-11 shrink-0 sm:h-10" onClick={() => copy('link', shareUrl)}>
              {linkCopied && <Check aria-hidden="true" />}
              {linkCopied ? t('common.copied') : t('common.copy')}
            </Button>
            {canNativeShare && (
              <Button
                variant="secondary"
                size="icon"
                className="h-11 w-11 shrink-0 sm:h-10 sm:w-10"
                title={t('video.share.moreApps')}
                aria-label={t('video.share.moreApps')}
                onClick={() => void nativeShare()}
              >
                <Share2 aria-hidden="true" />
              </Button>
            )}
          </div>

          {setIncludeTimestamp && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="share-timestamp-checkbox"
                checked={includeTimestamp}
                onCheckedChange={checked => setIncludeTimestamp(!!checked)}
              />
              <label
                htmlFor="share-timestamp-checkbox"
                className="flex min-h-11 cursor-pointer select-none items-center gap-2 text-sm sm:min-h-0"
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>{t('video.share.includeTimestamp')}</span>
              </label>
            </div>
          )}

          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {targets.map(({ href, name, title, Icon }) => (
              <li key={name}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={title}
                  aria-label={title}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="max-w-full truncate">{name}</span>
                </a>
              </li>
            ))}
          </ul>

          <Collapsible open={embedOpen} onOpenChange={setEmbedOpen} className="border-t pt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="h-11 w-full justify-between px-2 sm:h-10">
                <span className="flex items-center gap-2">
                  <Code aria-hidden="true" />
                  {t('video.share.embedTab')}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn('transition-transform', embedOpen && 'rotate-180')}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <label htmlFor="share-embed-code" className="text-sm font-medium">
                {t('video.share.embedCode')}
              </label>
              <Textarea
                id="share-embed-code"
                value={embedCode}
                readOnly
                rows={5}
                className="font-mono text-xs"
                onFocus={e => e.target.select()}
              />
              <Button
                variant="secondary"
                className="h-11 w-full sm:h-10"
                onClick={() => copy('embed', embedCode)}
              >
                {embedCopied && <Check aria-hidden="true" />}
                {embedCopied ? t('common.copied') : t('video.share.copyEmbed')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('video.share.embedDescription')}</p>
            </CollapsibleContent>
          </Collapsible>

          <p role="status" aria-live="polite" className="text-sm empty:hidden">
            {copyResult &&
              (copyResult.ok ? (
                <span className="sr-only">{t('common.copied')}</span>
              ) : (
                <span className="text-destructive">{t('common.copyFailed')}</span>
              ))}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ShareButton
