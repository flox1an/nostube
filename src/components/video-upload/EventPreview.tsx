import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useTranslation } from 'react-i18next'

interface EventPreviewProps {
  event: {
    kind: number
    content: string
    created_at: number | string
    tags: string[][]
  } | null
}

export function EventPreview({ event }: EventPreviewProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!event) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(event, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {t('upload.eventPreview.title', { defaultValue: 'Event Preview' })}
            {event && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">kind:{event.kind}</span>
            )}
          </Button>
        </CollapsibleTrigger>
        {isOpen && event && (
          <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-2">
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                {t('upload.eventPreview.copied', { defaultValue: 'Copied' })}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                {t('upload.eventPreview.copy', { defaultValue: 'Copy' })}
              </>
            )}
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="mt-2 bg-muted rounded-lg p-4 overflow-x-auto">
          {event ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(event, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t('upload.eventPreview.noVideo', {
                defaultValue: 'Upload a video to see the event preview',
              })}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t('upload.eventPreview.description', {
            defaultValue:
              'This is a preview of the Nostr event that will be published. Some values like timestamps and thumbnail URLs will be generated at publish time.',
          })}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
