import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧' },
  { code: 'es', flag: '🇪🇸' },
  { code: 'de', flag: '🇩🇪' },
  { code: 'ru', flag: '🇷🇺' },
  { code: 'ja', flag: '🇯🇵' },
  { code: 'fr', flag: '🇫🇷' },
  { code: 'zh', flag: '🇨🇳' },
  { code: 'pt', flag: '🇧🇷' },
  { code: 'ko', flag: '🇰🇷' },
  { code: 'it', flag: '🇮🇹' },
  { code: 'tr', flag: '🇹🇷' },
  { code: 'nl', flag: '🇳🇱' },
]

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
        <Label htmlFor="title">{t('upload.form.title')}</Label>
        <Input id="title" value={title} onChange={e => onTitleChange(e.target.value)} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">{t('upload.form.description')}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="language">{t('upload.form.language')}</Label>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger id="language">
            <SelectValue placeholder={t('upload.form.selectLanguage')} />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map(lang => (
              <SelectItem key={lang.code} value={lang.code}>
                {lang.flag} {t(`languages.${lang.code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
