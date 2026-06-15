import { useState, useMemo } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RichTextContent } from '@/components/RichTextContent'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { useToast } from '@/hooks/useToast'
import { nowInSecs } from '@/lib/utils'
import type { VideoNote } from '@/hooks/useVideoNotes'

interface PublishNoteDialogProps {
  note: VideoNote | null
  onOpenChange: (open: boolean) => void
  onPublished: (noteId: string) => void
}

function buildDescription(note: VideoNote): string {
  let text = note.content
  for (const url of note.videoUrls) {
    text = text.replace(url, '')
  }
  return text.replace(/\s+/g, ' ').trim()
}

function extractHashtags(text: string): string[] {
  const seen = new Set<string>()
  const matches = text.match(/#(\w+)/g) ?? []
  return matches
    .map((m: string) => m.slice(1).toLowerCase())
    .filter(t => !seen.has(t) && seen.add(t))
}

export function PublishNoteDialog({ note, onOpenChange, onPublished }: PublishNoteDialogProps) {
  const { publish, isPending } = useNostrPublish()
  const { toast } = useToast()
  const [title, setTitle] = useState('')

  const description = useMemo(() => (note ? buildDescription(note) : ''), [note])
  const hashtags = useMemo(() => (note ? extractHashtags(note.content) : []), [note])

  const handlePublish = async () => {
    if (!note || !title.trim()) return

    const tags: string[][] = [
      ['d', crypto.randomUUID()],
      ['title', title.trim()],
      ['alt', description],
      ['published_at', note.created_at.toString()],
      ...note.imetaTags,
      ...hashtags.map(t => ['t', t]),
      ...note.pubkeys.map(({ pubkey, relays }) =>
        relays.length > 0 ? ['p', pubkey, relays[0]] : ['p', pubkey]
      ),
    ]

    try {
      await publish({
        event: {
          kind: 34235,
          content: description,
          created_at: nowInSecs(),
          tags,
        },
      })
      toast({ title: 'Video published', duration: 4000 })
      onPublished(note.id)
      onOpenChange(false)
    } catch (err) {
      toast({
        title: 'Publish failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
        duration: 5000,
      })
    }
  }

  return (
    <Dialog open={!!note} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish as video</DialogTitle>
        </DialogHeader>

        {note && (
          <div className="space-y-4">
            {/* Thumbnail / video preview */}
            {note.thumbnailUrl && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                <img
                  src={note.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={e => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
                {note.videoUrls[0] && (
                  <a
                    href={note.videoUrls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100"
                  >
                    <span className="rounded bg-black/60 px-2 py-1 text-sm text-white">
                      Open video ↗
                    </span>
                  </a>
                )}
              </div>
            )}

            {/* Description */}
            {description && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <RichTextContent content={description} className="text-muted-foreground" />
              </div>
            )}

            {/* Hashtags */}
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {hashtags.map(t => (
                  <Badge key={t} variant="secondary">
                    #{t}
                  </Badge>
                ))}
              </div>
            )}

            {/* Title input */}
            <div className="space-y-1.5">
              <Label htmlFor="publish-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="publish-title"
                placeholder="Enter a title for this video"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && title.trim()) handlePublish()
                }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={!title.trim() || isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Publish
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
