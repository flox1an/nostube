import { useState, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Plus, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import {
  parseOriginInput,
  getIdentity,
  getPlatformName,
  getPlatformColor,
} from '@/utils/origin-utils'

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

  const handleAdd = useCallback(() => {
    if (!inputValue.trim()) return

    const newTags = parseOriginInput(inputValue)
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
            const rTag = group.find(t => t[0] === 'r')
            const fullUrl = rTag ? rTag[1] : identity

            return (
              <Badge
                key={index}
                variant="secondary"
                title={fullUrl}
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
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
