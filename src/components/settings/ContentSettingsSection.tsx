import { useTranslation } from 'react-i18next'
import { useAppContext, useSelectedPreset, useCurrentUser } from '@/hooks'
import { useGlobalScore } from '@/hooks/useTrustScore'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { defaultResizeServer } from '@/constants/servers'
import { Info } from 'lucide-react'
import { type NsfwFilter, type PreferredQuality } from '@/contexts/AppContext'

export function ContentSettingsSection() {
  const { t } = useTranslation()
  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const { user } = useCurrentUser()
  const { globalScore, isLoading: scoreLoading } = useGlobalScore(user?.pubkey)
  const nsfwLocked = !scoreLoading && (globalScore === null || globalScore < 0.2)

  const handleNsfwFilterChange = (value: NsfwFilter) => {
    if (nsfwLocked) return
    updateConfig(currentConfig => ({
      ...currentConfig,
      nsfwFilter: value,
    }))
  }

  const handleYouTubeContentChange = (checked: boolean) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      showYouTubeContent: checked,
    }))
  }

  const handleAudioContentChange = (checked: boolean) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      showAudioContent: checked,
    }))
  }

  const handlePreferredQualityChange = (value: PreferredQuality) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      preferredQuality: value,
    }))
  }

  const handleThumbServerChange = (value: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      thumbResizeServerUrl: value.trim() || undefined,
    }))
  }

  return (
    <div className="divide-y divide-border">
      <p className="text-sm text-muted-foreground pb-6">
        {t('settings.general.description', {
          defaultValue: 'Configure content and playback preferences',
        })}
      </p>

      {/* Default Video Quality */}
      <div className="py-6">
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="content-quality-select" className="font-medium">
              {t('settings.general.preferredQuality', { defaultValue: 'Default Video Quality' })}
            </Label>
            <p id="content-quality-description" className="text-xs text-muted-foreground">
              {t('settings.general.preferredQualityDescription', {
                defaultValue:
                  'Choose which video quality is selected by default. You can always switch in the player.',
              })}
            </p>
          </div>
          <Select
            value={config.preferredQuality ?? '720p'}
            onValueChange={value => handlePreferredQualityChange(value as PreferredQuality)}
          >
            <SelectTrigger
              id="content-quality-select"
              className="w-full max-w-sm shrink-0 sm:w-[200px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="720p">
                {t('settings.general.quality720p', { defaultValue: 'Mid quality (720p)' })}
              </SelectItem>
              <SelectItem value="highest">
                {t('settings.general.qualityHighest', { defaultValue: 'Highest available' })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Filters */}
      <div className="space-y-3 py-6">
        <div>
          <h3 className="text-base font-semibold">
            {t('settings.general.contentFilters', { defaultValue: 'Content Filters' })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('settings.general.contentFiltersDescription', {
              defaultValue: 'Control which types of content are shown in feeds and suggestions.',
            })}
          </p>
        </div>

        {/* YouTube content toggle */}
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="content-youtube" className="cursor-pointer font-medium">
              {t('settings.general.youtubeContent', { defaultValue: 'YouTube content' })}
            </Label>
            <p id="content-youtube-description" className="text-xs text-muted-foreground">
              {t('settings.general.youtubeContentDescription', {
                defaultValue: 'Show videos that link to or embed YouTube content.',
              })}
            </p>
          </div>
          <Switch
            id="content-youtube"
            className="mt-0.5 shrink-0 sm:mt-0"
            checked={config.showYouTubeContent ?? true}
            onCheckedChange={handleYouTubeContentChange}
            aria-describedby="content-youtube-description"
          />
        </div>

        {/* Audio content toggle */}
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="content-audio" className="cursor-pointer font-medium">
              {t('settings.general.audioContent', { defaultValue: 'Audio content' })}
            </Label>
            <p id="content-audio-description" className="text-xs text-muted-foreground">
              {t('settings.general.audioContentDescription', {
                defaultValue: 'Show audio-only posts such as MP3 podcast episodes.',
              })}
            </p>
          </div>
          <Switch
            id="content-audio"
            className="mt-0.5 shrink-0 sm:mt-0"
            checked={config.showAudioContent ?? true}
            onCheckedChange={handleAudioContentChange}
            aria-describedby="content-audio-description"
          />
        </div>

        {/* NSFW filter */}
        {nsfwLocked && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {t('settings.general.nsfwLockedInfo', {
                defaultValue:
                  'NSFW content is hidden because your NosTube trust score is below 20% or not yet available. Build your score by engaging with the platform.',
              })}
            </p>
          </div>
        )}
        <div
          className={`flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4 ${nsfwLocked ? 'opacity-50' : ''}`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <Label
              htmlFor="content-nsfw"
              className={nsfwLocked ? 'cursor-not-allowed font-medium' : 'font-medium'}
            >
              {t('settings.general.nsfwFilter')}
            </Label>
          </div>
          <Select
            value={nsfwLocked ? 'hide' : (config.nsfwFilter ?? 'hide')}
            onValueChange={value => handleNsfwFilterChange(value as NsfwFilter)}
            disabled={nsfwLocked}
          >
            <SelectTrigger id="content-nsfw" className="w-full max-w-sm shrink-0 sm:w-[360px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hide">{t('settings.general.nsfwHide')}</SelectItem>
              <SelectItem value="warning">{t('settings.general.nsfwWarning')}</SelectItem>
              <SelectItem value="show">{t('settings.general.nsfwShow')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.nsfwFilterDescription')}
        </p>
      </div>

      {/* Thumbnail Resize Server */}
      <div className="space-y-2 py-6">
        <h3 className="text-base font-semibold">{t('settings.general.thumbnailServer')}</h3>
        <Input
          id="content-thumb-server"
          type="url"
          placeholder={presetContent.defaultThumbResizeServer || defaultResizeServer}
          value={config.thumbResizeServerUrl || ''}
          onChange={e => handleThumbServerChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('settings.general.thumbnailServerDescription')}
        </p>
      </div>
    </div>
  )
}
