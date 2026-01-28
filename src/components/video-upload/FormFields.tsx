import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { LanguageSelect } from '@/components/ui/language-select'
import { TagInput } from '@/components/ui/tag-input'
import { useTranslation } from 'react-i18next'

interface FormFieldsProps {
  title: string
  onTitleChange: (title: string) => void
  description: string
  onDescriptionChange: (description: string) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
  language: string
  onLanguageChange: (language: string) => void
}

// Prevent Enter key from submitting the form
const preventEnterSubmit = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
  }
}

export function FormFields({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
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
        <Input
          id="title"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          onKeyDown={preventEnterSubmit}
          required
        />
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
        <TagInput
          id="tags"
          tags={tags}
          onTagsChange={onTagsChange}
          placeholder={t('upload.form.tagsHint')}
        />
      </div>
    </>
  )
}
