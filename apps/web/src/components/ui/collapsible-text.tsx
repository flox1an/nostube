import { useState, useRef, useEffect } from 'react'
import { Button } from '@nostube/widgets/components/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichTextContent } from '@/components/RichTextContent'

interface CollapsibleTextProps {
  text: string
  maxLines?: number
  alwaysExpanded?: boolean
  className?: string
  /**
   * Optional video link for timestamp linking (e.g., "nevent1...")
   * If provided, timestamps like "1:23" will be rendered as clickable links
   */
  videoLink?: string
  /** Pubkey of the event this text was rendered from, forwarded to inline images. */
  authorPubkey?: string
}

export function CollapsibleText({
  text,
  maxLines = 5,
  className,
  videoLink,
  alwaysExpanded = false,
  authorPubkey,
}: CollapsibleTextProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showButton, setShowButton] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (alwaysExpanded) {
      setShowButton(false)
      return
    }
    if (textRef.current) {
      const lineHeight = parseInt(getComputedStyle(textRef.current).lineHeight)
      const height = textRef.current.scrollHeight
      const lines = height / lineHeight
      setShowButton(lines > maxLines)
    }
  }, [alwaysExpanded, text, maxLines])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't toggle if clicking on a link
    if ((e.target as HTMLElement).tagName === 'A') {
      return
    }
    if (showButton) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className={className}>
      <div
        ref={textRef}
        className={cn('whitespace-pre-wrap break-words break-all', showButton && 'cursor-pointer')}
        style={
          !alwaysExpanded && !isExpanded
            ? {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: maxLines,
                overflow: 'hidden',
              }
            : undefined
        }
        onClick={handleClick}
      >
        <RichTextContent content={text} videoLink={videoLink} authorPubkey={authorPubkey} />
      </div>
      {showButton && (
        <Button
          variant="ghost"
          size="sm"
          className="-mx-2 -mb-2 h-11 px-2"
          aria-expanded={isExpanded}
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
