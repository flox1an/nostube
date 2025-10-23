import { useState, useRef, useEffect } from 'react'
import { Button } from './button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleTextProps {
  text: string
  maxLines?: number
  className?: string
}

// Helper function to render text with clickable links
const renderTextWithLinks = (text: string) => {
  const parts: React.ReactNode[] = []
  const urlRegex = /(https?:\/\/[^\s]+)/g
  let lastIndex = 0

  text.replace(urlRegex, (match, url, offset) => {
    if (offset > lastIndex) {
      parts.push(text.substring(lastIndex, offset))
    }
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
  const textRef = useRef<HTMLParagraphElement>(null)

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
      <p
        ref={textRef}
        className={cn('whitespace-pre-wrap break-words break-all', !isExpanded && 'line-clamp-5')}
      >
        {renderTextWithLinks(text)}
      </p>
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
