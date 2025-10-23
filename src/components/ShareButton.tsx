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
import { Clock, Mail, Send, Twitter, Globe, Facebook, Share2, Link as LinkIcon } from 'lucide-react'
import React from 'react'

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
  return (
    <Dialog open={shareOpen} onOpenChange={setShareOpen}>
      <DialogTrigger asChild>
        <Button title="Share" aria-label="Share" variant="secondary">
          <LinkIcon className="w-6 h-6" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this video</DialogTitle>
          <DialogDescription>
            Share this video on your favorite platform or copy the link.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-4">
          <Input
            type="text"
            value={shareUrl}
            readOnly
            className="flex-1 text-xs"
            onFocus={e => e.target.select()}
          />
          <Button
            size="sm"
            className="ml-2"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl)
            }}
          >
            Copy
          </Button>
        </div>
        <div className="flex items-center gap-2 mb-4">
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
            <span>Include current timestamp</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-4 justify-center mt-2">
          <a
            href={shareLinks.mailto}
            target="_blank"
            rel="noopener noreferrer"
            title="Share via Email"
          >
            <Mail className="w-7 h-7" />
          </a>
          <a
            href={shareLinks.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            title="Share on WhatsApp"
          >
            <Send className="w-7 h-7" />
          </a>
          <a href={shareLinks.x} target="_blank" rel="noopener noreferrer" title="Share on X">
            <Twitter className="w-7 h-7" />
          </a>
          <a
            href={shareLinks.reddit}
            target="_blank"
            rel="noopener noreferrer"
            title="Share on Reddit"
          >
            <Globe className="w-7 h-7" />
          </a>
          <a
            href={shareLinks.facebook}
            target="_blank"
            rel="noopener noreferrer"
            title="Share on Facebook"
          >
            <Facebook className="w-7 h-7" />
          </a>
          <a
            href={shareLinks.pinterest}
            target="_blank"
            rel="noopener noreferrer"
            title="Share on Pinterest"
          >
            <Share2 className="w-7 h-7" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ShareButton
