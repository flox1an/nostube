import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { LanguageSelect } from '@/components/ui/language-select'
import { useTranslation } from 'react-i18next'

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
  language: string
  onLanguageChange: (language: string) => void
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
  language,
  onLanguageChange,
}: FormFieldsProps) {
  const { t } = useTranslation()

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">
          {t('upload.form.title')} <span className="text-destructive">*</span>
        </Label>
        <Input id="title" value={title} onChange={e => onTitleChange(e.target.value)} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t('upload.form.description')}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          rows={10}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="language">{t('upload.form.language')}</Label>
        <LanguageSelect
          id="language"
          value={language}
          onValueChange={onLanguageChange}
          placeholder={t('upload.form.selectLanguage')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tags">{t('upload.form.tags')}</Label>
        <Input
          id="tags"
          value={tagInput}
          onChange={e => onTagInputChange(e.target.value)}
          onKeyDown={onAddTag}
          onPaste={onPaste}
          onBlur={onTagInputBlur}
          placeholder={t('upload.form.tagsHint')}
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tags.map((tag, index) => (
              <Badge
                key={`${tag}-${index}`}
                variant="secondary"
                className="flex items-center gap-1"
              >
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
