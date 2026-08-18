import { useState, useMemo } from 'react'
import { Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
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
import { PeoplePicker, type SelectedPerson } from '@/components/ui/people-picker'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useToast } from '@/hooks/useToast'
import { nowInSecs } from '@/lib/utils'
import type { VideoNote } from '@/hooks/useVideoNotes'
import { useImageCascade } from '@/hooks/useImageCascade'

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

function buildTags(
  note: VideoNote,
  title: string,
  description: string,
  hashtags: string[],
  people: SelectedPerson[],
  draftId: string
): string[][] {
  return [
    ['d', draftId],
    ['title', title],
    ['alt', description],
    ['published_at', note.created_at.toString()],
    ...note.imetaTags,
    ...hashtags.map(t => ['t', t]),
    ...people.map(({ pubkey, relays }) =>
      relays && relays.length > 0 ? ['p', pubkey, relays[0]] : ['p', pubkey]
    ),
  ]
}

export function PublishNoteDialog({ note, onOpenChange, onPublished }: PublishNoteDialogProps) {
  const { publish, isPending } = useNostrPublish()
  const { user } = useCurrentUser()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [people, setPeople] = useState<SelectedPerson[]>([])
  const [showJson, setShowJson] = useState(false)
  // stable d-tag for preview; regenerated on each open via note change
  const draftId = useMemo(() => crypto.randomUUID(), [note]) // eslint-disable-line react-hooks/exhaustive-deps

  const description = useMemo(() => (note ? buildDescription(note) : ''), [note])
  const hashtags = useMemo(() => (note ? extractHashtags(note.content) : []), [note])
  const thumbnail = useImageCascade({
    src: note?.thumbnailUrl,
    videoUrl: note?.videoUrls[0],
    variant: 'preview',
    authorPubkey: user?.pubkey,
  })

  // Initialize people from note.pubkeys whenever the note changes
  useMemo(() => {
    if (note) {
      setPeople(note.pubkeys.map(({ pubkey, relays }) => ({ pubkey, name: '', relays })))
    } else {
      setPeople([])
      setTitle('')
      setShowJson(false)
    }
  }, [note])

  const previewEvent = useMemo(() => {
    if (!note) return null
    return {
      kind: 34235,
      content: description,
      created_at: '<generated on publish>',
      tags: buildTags(note, title || '<title>', description, hashtags, people, draftId),
    }
  }, [note, title, description, hashtags, people, draftId])

  const handlePublish = async () => {
    if (!note || !title.trim()) return

    const tags = buildTags(note, title.trim(), description, hashtags, people, draftId)

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
            {thumbnail.src && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                <img
                  src={thumbnail.src}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={thumbnail.onError}
                  onLoad={thumbnail.onLoad}
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

            {/* People tagging */}
            <div className="space-y-1.5">
              <Label>People</Label>
              <PeoplePicker people={people} onPeopleChange={setPeople} />
            </div>

            {/* JSON preview */}
            <div className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
                onClick={() => setShowJson(v => !v)}
              >
                Event JSON preview
                {showJson ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showJson && (
                <pre className="overflow-x-auto border-t bg-muted/40 p-3 text-xs leading-relaxed">
                  {JSON.stringify(previewEvent, null, 2)}
                </pre>
              )}
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
