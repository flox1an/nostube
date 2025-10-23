import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'

interface FormFieldsProps {
  title: string
  onTitleChange: (title: string) => void
  description: string
  onDescriptionChange: (description: string) => void
  tags: string[]
  tagInput: string
  onTagInputChange: (input: string) => void
  onAddTag: (e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  onRemoveTag: (tag: string) => void
  onTagInputBlur: () => void
}

export function FormFields({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  tags,
  tagInput,
  onTagInputChange,
  onAddTag,
  onPaste,
  onRemoveTag,
  onTagInputBlur,
}: FormFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={e => onTitleChange(e.target.value)} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          value={tagInput}
          onChange={e => onTagInputChange(e.target.value)}
          onKeyDown={onAddTag}
          onPaste={onPaste}
          onBlur={onTagInputBlur}
          placeholder="Press Enter to add tags, or paste space-separated tags"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
