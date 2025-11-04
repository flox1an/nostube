import { useState, useRef, useEffect } from 'react'
import { Button } from './button'
import { ChevronDown, ChevronUp, Youtube, Instagram, Twitter, Facebook } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from './badge'

interface CollapsibleTextProps {
  text: string
  maxLines?: number
  className?: string
}

interface SocialMediaPlatform {
  name: string
  icon: React.ComponentType<{ className?: string }>
  patterns: RegExp[]
  extractTitle: (url: string) => string
}

// Define social media platforms
const socialMediaPlatforms: SocialMediaPlatform[] = [
  {
    name: 'YouTube',
    icon: Youtube,
    patterns: [/youtube\.com/, /youtu\.be/],
    extractTitle: (url: string) => {
      // Handle channel links like youtube.com/@username
      const channelMatch = url.match(/youtube\.com\/([^/?]+)\/?/)
      if (channelMatch) return `@${channelMatch[1]}`

      // Handle video links (watch, shorts, youtu.be)
      const videoMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([^&?/]+)/)
      return videoMatch ? videoMatch[1] : 'Video'
    },
  },
  {
    name: 'Instagram',
    icon: Instagram,
    patterns: [/instagram\.com/, /instagr\.am/],
    extractTitle: (url: string) => {
      // Handle both profile links and post/reel links
      const postMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?]+)/)
      if (postMatch) return postMatch[1]

      // Handle profile links like instagram.com/username or instagram.com/username/
      const profileMatch = url.match(/instagram\.com\/([^/?]+)\/?/)
      return profileMatch ? `@${profileMatch[1]}` : 'Post'
    },
  },
  {
    name: 'X',
    icon: Twitter,
    patterns: [/twitter\.com/, /x\.com/],
    extractTitle: (url: string) => {
      const match = url.match(/(?:twitter|x)\.com\/([^/]+)\/status\/([^/?]+)/)
      if (match) return `@${match[1]}`
      const userMatch = url.match(/(?:twitter|x)\.com\/([^/?]+)\/?/)
      return userMatch ? `@${userMatch[1]}` : 'Tweet'
    },
  },
  {
    name: 'Facebook',
    icon: Facebook,
    patterns: [/facebook\.com/, /fb\.com/],
    extractTitle: (url: string) => {
      const match = url.match(/facebook\.com\/([^/?]+)\/?/)
      return match ? match[1] : 'Post'
    },
  },
  {
    name: 'TikTok',
    icon: () => (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    ),
    patterns: [/tiktok\.com/],
    extractTitle: (url: string) => {
      const match = url.match(/tiktok\.com\/@([^/?]+)\/?/)
      return match ? `@${match[1]}` : 'Video'
    },
  },
  {
    name: 'SoundCloud',
    icon: () => (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.255-2.154c-.009-.057-.049-.1-.099-.1m-.899.828c-.051 0-.091.04-.099.092L0 14.479l.176 1.434c.008.056.048.091.099.091.051 0 .091-.035.102-.091l.21-1.434-.21-2.334c-.011-.052-.051-.092-.102-.092m1.793-.777c-.05 0-.089.039-.098.092l-.255 2.103.255 2.154c.009.05.048.09.098.09.051 0 .094-.04.102-.09l.291-2.154-.291-2.103c-.008-.053-.051-.092-.102-.092m.899-.551c-.05 0-.09.04-.099.098l-.255 2.653.255 2.154c.009.056.049.099.099.099.05 0 .09-.043.099-.099l.291-2.154-.291-2.653c-.009-.058-.049-.098-.099-.098m.898-.54c-.05 0-.089.035-.098.094l-.255 3.194.255 2.161c.009.058.048.097.098.097.05 0 .09-.039.099-.097l.291-2.161-.291-3.194c-.009-.059-.049-.094-.099-.094m.899.001c-.051 0-.091.035-.102.09l-.253 3.192.253 2.162c.011.058.051.09.102.09.05 0 .089-.032.099-.09l.329-2.162-.329-3.192c-.01-.055-.049-.09-.099-.09m.891.106c-.051 0-.089.035-.097.098l-.29 3.086.29 2.162c.008.062.046.099.097.099.053 0 .095-.037.104-.099l.329-2.162-.329-3.086c-.009-.063-.051-.098-.104-.098m.899-.106c-.051 0-.091.042-.099.098l-.255 3.192.255 2.154c.008.056.048.099.099.099.051 0 .09-.043.102-.099l.364-2.154-.364-3.192c-.012-.056-.051-.098-.102-.098m1.793.654c-.053 0-.093.039-.102.099l-.255 2.538.255 2.154c.009.06.049.099.102.099.051 0 .09-.039.102-.099l.401-2.154-.401-2.538c-.012-.06-.051-.099-.102-.099m.899.106c-.052 0-.095.041-.102.1l-.218 2.432.218 2.162c.007.06.05.1.102.1.052 0 .094-.04.104-.1l.437-2.162-.437-2.432c-.01-.059-.052-.1-.104-.1m.898.001c-.05 0-.089.035-.097.099l-.255 2.431.255 2.162c.008.062.047.1.097.1.053 0 .095-.038.104-.1l.473-2.162-.473-2.431c-.009-.064-.051-.099-.104-.099m.899.106c-.053 0-.095.042-.104.104l-.255 2.325.255 2.162c.009.062.051.104.104.104.051 0 .09-.042.099-.104l.509-2.162-.509-2.325c-.009-.062-.048-.104-.099-.104m.898-.106c-.051 0-.089.035-.099.104l-.255 2.431.255 2.162c.01.062.048.1.099.1.053 0 .095-.038.104-.1l.545-2.162-.545-2.431c-.009-.069-.051-.104-.104-.104m1.793.654c-.051 0-.09.042-.102.104l-.218 1.777.218 2.162c.012.062.051.104.102.104.053 0 .094-.042.104-.104l.582-2.162-.582-1.777c-.01-.062-.051-.104-.104-.104m.898.001c-.053 0-.095.042-.104.104l-.255 1.776.255 2.161c.009.063.051.104.104.104.051 0 .09-.041.099-.104l.618-2.161-.618-1.776c-.009-.062-.048-.104-.099-.104m.899.106c-.052 0-.094.041-.103.104l-.255 1.67.255 2.162c.009.062.051.104.103.104.052 0 .094-.042.104-.104l.654-2.162-.654-1.67c-.01-.063-.052-.104-.104-.104m.899-.001c-.053 0-.095.042-.104.105l-.255 1.669.255 2.161c.009.063.051.105.104.105.052 0 .094-.042.103-.105l.691-2.161-.691-1.669c-.009-.063-.051-.105-.103-.105m.898.001c-.051 0-.089.042-.102.105l-.255 1.668.255 2.162c.013.063.051.105.102.105.053 0 .095-.042.104-.105l.727-2.162-.727-1.668c-.009-.063-.051-.105-.104-.105m1.799.654c-.053 0-.095.042-.104.105l-.218 1.014.218 2.162c.009.062.051.104.104.104.052 0 .094-.042.104-.104l.763-2.162-.763-1.014c-.01-.063-.052-.105-.104-.105m.898.001c-.053 0-.095.042-.103.105l-.256 1.013.256 2.161c.008.063.05.105.103.105.052 0 .094-.042.103-.105l.8-2.161-.8-1.013c-.009-.063-.051-.105-.103-.105m.898.106c-.051 0-.089.042-.097.105l-.255.907.255 2.162c.008.063.046.105.097.105.053 0 .095-.042.104-.105l.836-2.162-.836-.907c-.009-.063-.051-.105-.104-.105" />
      </svg>
    ),
    patterns: [/soundcloud\.com/],
    extractTitle: (url: string) => {
      // Handle track links like soundcloud.com/artist/track
      const trackMatch = url.match(/soundcloud\.com\/([^/?]+)\/([^/?]+)\/?/)
      if (trackMatch) return `${trackMatch[1]} / ${trackMatch[2]}`

      // Handle artist/user links like soundcloud.com/artist
      const artistMatch = url.match(/soundcloud\.com\/([^/?]+)\/?/)
      return artistMatch ? artistMatch[1] : 'Track'
    },
  },
  {
    name: 'VK',
    icon: () => (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14c5.6 0 6.93-1.33 6.93-6.93V8.93C22 3.33 20.67 2 15.07 2zm3.6 14.1h-1.45c-.65 0-.85-.52-2.01-1.68-1.02-1-1.47-1.13-1.73-1.13-.35 0-.45.1-.45.59v1.53c0 .41-.13.66-1.22.66-1.82 0-3.84-.95-5.26-2.72C4.87 10.5 4.38 8.17 4.38 7.74c0-.26.1-.5.59-.5h1.45c.44 0 .6.2.77.67.87 2.48 2.33 4.66 2.93 4.66.23 0 .33-.11.33-.7V9.96c-.07-1.13-.66-1.23-.66-1.63 0-.21.17-.42.44-.42h2.28c.37 0 .51.2.51.64v3.43c0 .37.17.51.27.51.23 0 .42-.14.85-.56 1.31-1.47 2.25-3.74 2.25-3.74.12-.26.32-.5.76-.5h1.45c.53 0 .65.27.53.64-.19.92-2.17 3.8-2.17 3.8-.19.31-.26.44 0 .78.19.26.82.8 1.24 1.29.77.88 1.37 1.62 1.53 2.13.15.51-.08.77-.59.77z" />
      </svg>
    ),
    patterns: [/vk\.com/],
    extractTitle: (url: string) => {
      // Handle video links like vk.com/video-12345_67890
      const videoMatch = url.match(/vk\.com\/video(-?\d+_\d+)/)
      if (videoMatch) return `video ${videoMatch[1]}`

      // Handle user/group links like vk.com/username or vk.com/id123456
      const userMatch = url.match(/vk\.com\/([^/?]+)\/?/)
      return userMatch ? userMatch[1] : 'Page'
    },
  },
]

// Detect if URL is from a social media platform
const detectSocialMedia = (url: string): SocialMediaPlatform | null => {
  for (const platform of socialMediaPlatforms) {
    if (platform.patterns.some(pattern => pattern.test(url))) {
      return platform
    }
  }
  return null
}

// Helper function to render text with clickable links
const renderTextWithLinks = (text: string) => {
  const parts: React.ReactNode[] = []
  // Match URLs with optional parentheses around them
  // The regex captures: (optional opening paren)(URL)(optional closing paren)
  const urlRegex = /(\()?(https?:\/\/[^\s)]+)(\))?/g
  let lastIndex = 0

  text.replace(urlRegex, (match, _openParen, url, _closeParen, offset) => {
    // Add any text before this match
    if (offset > lastIndex) {
      parts.push(text.substring(lastIndex, offset))
    }

    const platform = detectSocialMedia(url)

    if (platform) {
      const Icon = platform.icon
      const title = platform.extractTitle(url)

      parts.push(
        <a
          key={url + offset}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center"
        >
          <Badge
            variant="outline"
            className="inline-flex items-center gap-2 py-1 px-2 hover:bg-primary/80"
          >
            <Icon className="h-4 w-4" />
            <span className="font-medium">{platform.name}</span>
            <span className="text-muted-foreground">/ {title}</span>
          </Badge>
        </a>
      )
    } else {
      parts.push(
        <a
          key={url + offset}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-foreground hover:underline"
        >
          {url}
        </a>
      )
    }

    // Update lastIndex to skip past the entire match (including any parens)
    lastIndex = offset + match.length
    return match // Return match to `replace` for correct iteration
  })

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts
}

export function CollapsibleText({ text, maxLines = 5, className }: CollapsibleTextProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showButton, setShowButton] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (textRef.current) {
      const lineHeight = parseInt(getComputedStyle(textRef.current).lineHeight)
      const height = textRef.current.scrollHeight
      const lines = height / lineHeight
      setShowButton(lines > maxLines)
    }
  }, [text, maxLines])

  return (
    <div className={className}>
      <div
        ref={textRef}
        className={cn('whitespace-pre-wrap break-words break-all', !isExpanded && 'line-clamp-5')}
      >
        {renderTextWithLinks(text)}
      </div>
      {showButton && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-8 px-2"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              Show less
              <ChevronUp className="ml-1 h-4 w-4" />
            </>
          ) : (
            <>
              Show more
              <ChevronDown className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      )}
    </div>
  )
}
