import { useState, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Plus, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'

const PLATFORMS = [
  {
    name: 'youtube',
    color: 'bg-[#FF0000] text-white',
    regex:
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i,
  },
  { name: 'tiktok', color: 'bg-[#000000] text-white', regex: /tiktok\.com\/.*\/video\/(\d+)/i },
  {
    name: 'instagram',
    color: 'bg-[#E1306C] text-white',
    regex: /instagram\.com\/(?:p|reels|reel)\/([a-zA-Z0-9_-]+)/i,
  },
  {
    name: 'twitter',
    color: 'bg-[#1DA1F2] text-white',
    regex: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  },
  { name: 'twitch', color: 'bg-[#9146FF] text-white', regex: /twitch\.tv\/videos\/(\d+)/i },
]

const NOSTR = [
  {
    type: 'e',
    regex:
      /(?:nostr:|https?:\/\/(?:njump\.me|primal\.net\/e)\/)?(nevent1[a-z0-9]+|note1[a-z0-9]+|[a-f0-9]{64})/i,
  },
  { type: 'a', regex: /(?:nostr:|https?:\/\/(?:njump\.me|primal\.net\/p)\/)?(naddr1[a-z0-9]+)/i },
  {
    type: 'p',
    regex:
      /(?:nostr:|https?:\/\/(?:njump\.me|primal\.net\/p)\/)?(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/i,
  },
]

// Helper to get identity from tags
function getIdentity(tags: string[][]): string {
  const originTag = tags.find(t => t[0] === 'origin')
  if (originTag) return `${originTag[1]}:${originTag[2]}`

  const eTag = tags.find(t => t[0] === 'e')
  if (eTag) return `nostr:${eTag[1]}`

  const aTag = tags.find(t => t[0] === 'a')
  if (aTag) return `nostr:${aTag[1]}`

  const pTag = tags.find(t => t[0] === 'p')
  if (pTag) return `nostr:${pTag[1]}`

  const rTag = tags.find(t => t[0] === 'r')
  if (rTag) return rTag[1]

  return ''
}

function getPlatformName(tags: string[][]): string {
  const originTag = tags.find(t => t[0] === 'origin')
  if (originTag) return originTag[1]

  const nostrTag = tags.find(t => ['e', 'p', 'a'].includes(t[0]))
  if (nostrTag) return 'nostr'

  return 'web'
}

function getPlatformColor(name: string): string {
  const platform = PLATFORMS.find(p => p.name === name)
  if (platform) return platform.color
  if (name === 'nostr') return 'bg-purple-600 text-white'
  return 'bg-gray-500 text-white'
}

interface OriginManagerProps {
  origins: string[][][] // Array of tag sets
  onOriginsChange: (origins: string[][][]) => void
}

export function OriginManager({ origins, onOriginsChange }: OriginManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [inputValue, setInputValue] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const parseInput = (input: string): string[][] | null => {
    const trimmed = input.trim()
    if (!trimmed) return null

    // Every unique input must generate an r (reference) tag
    const tags: string[][] = [['r', trimmed]]

    // Check platforms
    for (const platform of PLATFORMS) {
      const match = trimmed.match(platform.regex)
      if (match && match[1]) {
        tags.push(['origin', platform.name, match[1], trimmed])
        return tags
      }
    }

    // Check Nostr
    for (const nostr of NOSTR) {
      const match = trimmed.match(nostr.regex)
      if (match && match[1]) {
        tags.push([nostr.type, match[1]])
        return tags
      }
    }

    return tags
  }

  const handleAdd = useCallback(() => {
    if (!inputValue.trim()) return

    const newTags = parseInput(inputValue)
    if (!newTags) return

    const newIdentity = getIdentity(newTags)

    // Duplicate Rejection
    const isDuplicate = origins.some(group => getIdentity(group) === newIdentity)
    if (isDuplicate) {
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 400)
      toast({
        title: t('upload.origins.alreadyAdded', { defaultValue: 'Already Added' }),
        variant: 'destructive',
      })
      return
    }

    onOriginsChange([...origins, newTags])
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, origins, onOriginsChange, t, toast])

  const handleRemove = (index: number) => {
    const newOrigins = [...origins]
    newOrigins.splice(index, 1)
    onOriginsChange(newOrigins)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {t('upload.origins.label', { defaultValue: 'External References' })}
        </label>
        <p className="text-xs text-muted-foreground">
          {t('upload.origins.description', {
            defaultValue: 'Link to YouTube, TikTok, or other Nostr events.',
          })}
        </p>
        <div className="flex gap-2">
          <div className={cn('relative flex-1', isShaking && 'animate-shake')}>
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('upload.origins.placeholder', { defaultValue: 'URL or Nostr URI...' })}
              className={cn(isShaking && 'border-destructive focus-visible:ring-destructive')}
            />
            {isShaking && (
              <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
            )}
          </div>
          <Button type="button" onClick={handleAdd} disabled={!inputValue.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            {t('upload.origins.add', { defaultValue: 'Add' })}
          </Button>
        </div>
      </div>

      {origins.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {origins.map((group, index) => {
            const platform = getPlatformName(group)
            const identity = getIdentity(group)
            return (
              <Badge
                key={index}
                variant="secondary"
                className={cn(
                  'pl-0 pr-1 py-0 h-7 flex items-center gap-1 overflow-hidden max-w-[200px] sm:max-w-[300px]',
                  getPlatformColor(platform)
                )}
              >
                <div className="bg-white/20 px-2 h-full flex items-center capitalize text-[10px] font-bold">
                  {platform}
                </div>
                <span className="truncate text-xs flex-1">{identity}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3.3 w-3.3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
