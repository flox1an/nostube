import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Upload, Link } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface InputMethodSelectorProps {
  value: 'file' | 'url'
  onChange: (value: 'file' | 'url') => void
  disabled?: boolean
}

export function InputMethodSelector({ value, onChange, disabled }: InputMethodSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('upload.videoSource')}</Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex gap-6"
        aria-label={t('upload.videoSource')}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="file" id="file-upload" />
          <Label htmlFor="file-upload" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            {t('upload.uploadFile')}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="url" id="url-input" />
          <Label htmlFor="url-input" className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            {t('upload.fromUrl')}
          </Label>
        </div>
      </RadioGroup>
    </div>
  )
}
