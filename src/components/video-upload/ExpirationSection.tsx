import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from 'react-i18next'

interface ExpirationSectionProps {
  value: 'none' | '1day' | '7days' | '1month' | '1year'
  onChange: (value: 'none' | '1day' | '7days' | '1month' | '1year') => void
}

export function ExpirationSection({ value, onChange }: ExpirationSectionProps) {
  const { t } = useTranslation()

  const handleChange = (newValue: string) => {
    onChange(newValue as 'none' | '1day' | '7days' | '1month' | '1year')
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="expiration">{t('upload.expiration.title')}</Label>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger id="expiration">
          <SelectValue placeholder={t('upload.expiration.selectDuration')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t('upload.expiration.none')}</SelectItem>
          <SelectItem value="1day">{t('upload.expiration.1day')}</SelectItem>
          <SelectItem value="7days">{t('upload.expiration.7days')}</SelectItem>
          <SelectItem value="1month">{t('upload.expiration.1month')}</SelectItem>
          <SelectItem value="1year">{t('upload.expiration.1year')}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('upload.expiration.description')}</p>
    </div>
  )
}
