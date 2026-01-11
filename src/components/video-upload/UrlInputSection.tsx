import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface UrlInputSectionProps {
  videoUrl: string
  onVideoUrlChange: (url: string) => void
  onProcess: () => void
  isProcessing: boolean
  disabled?: boolean
}

export function UrlInputSection({
  videoUrl,
  onVideoUrlChange,
  onProcess,
  isProcessing,
  disabled,
}: UrlInputSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="video-url">{t('upload.videoUrl')}</Label>
      <div className="flex gap-2">
        <Input
          id="video-url"
          type="url"
          value={videoUrl}
          onChange={e => onVideoUrlChange(e.target.value)}
          placeholder={t('upload.videoUrlPlaceholder')}
          className="flex-1"
          disabled={disabled}
        />
        <Button type="button" onClick={onProcess} disabled={!videoUrl || isProcessing || disabled}>
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : t('upload.process')}
        </Button>
      </div>
    </div>
  )
}
