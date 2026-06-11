import { useState } from 'react'
import { useAppContext, useSelectedPreset, useFollowSet, useCurrentUser } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { type NsfwFilter, type PreferredQuality } from '@/contexts/AppContext'
import { defaultResizeServer } from '@/constants/servers'
import { SEARCH_SERVICE_URL } from '@/lib/search-client'
import { useTheme } from '@/providers/theme-provider'
import { availableThemes } from '@/lib/themes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from 'react-i18next'
import { Download, CheckCircle2, X } from 'lucide-react'

export function GeneralSettingsSection() {
  const { config, updateConfig } = useAppContext()
  const { presetContent } = useSelectedPreset()
  const { theme, setTheme, colorTheme, setColorTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const { user } = useCurrentUser()
  const { hasKind3Contacts, kind3PubkeyCount, importFromKind3, importProgress, cancelImport } =
    useFollowSet()
  const [isImporting, setIsImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)

  const handleThumbServerChange = (value: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      thumbResizeServerUrl: value.trim() || undefined,
    }))
  }

  const handleSearchServiceUrlChange = (value: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      searchServiceUrl: value.trim() || undefined,
    }))
  }

  const handleNsfwFilterChange = (value: NsfwFilter) => {
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

  const handlePreferredQualityChange = (value: PreferredQuality) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      preferredQuality: value,
    }))
  }

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div className="divide-y divide-border">
      <div className="pb-6">
        <p className="text-sm text-muted-foreground">{t('settings.general.description')}</p>
      </div>

      {/* Theme Mode */}
      <div className="space-y-3 py-6">
        <h3 className="text-base font-semibold">{t('settings.general.themeMode')}</h3>
        <RadioGroup
          value={theme}
          onValueChange={value => setTheme(value as 'light' | 'dark' | 'system')}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" id="theme-light" />
            <Label htmlFor="theme-light" className="font-normal cursor-pointer">
              {t('settings.general.light')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" id="theme-dark" />
            <Label htmlFor="theme-dark" className="font-normal cursor-pointer">
              {t('settings.general.dark')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="system" id="theme-system" />
            <Label htmlFor="theme-system" className="font-normal cursor-pointer">
              {t('settings.general.system')}
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.themeModeDescription')}
        </p>
      </div>

      {/* Color Theme */}
      <div className="space-y-2 py-6">
        <h3 className="text-base font-semibold">{t('settings.general.colorTheme')}</h3>
        <Select value={colorTheme} onValueChange={setColorTheme}>
          <SelectTrigger id="color-theme">
            <SelectValue placeholder={t('settings.general.selectColorTheme')} />
          </SelectTrigger>
          <SelectContent>
            {availableThemes.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.colorThemeDescription')}
        </p>
      </div>

      {/* Language */}
      <div className="space-y-2 py-6">
        <h3 className="text-base font-semibold">{t('settings.general.language')}</h3>
        <Select value={i18n.language} onValueChange={handleLanguageChange}>
          <SelectTrigger id="language">
            <SelectValue placeholder={t('settings.general.selectLanguage')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t('languages.en')}</SelectItem>
            <SelectItem value="de">{t('languages.de')}</SelectItem>
            <SelectItem value="es">{t('languages.es')}</SelectItem>
            <SelectItem value="fr">{t('languages.fr')}</SelectItem>
            <SelectItem value="ru">{t('languages.ru')}</SelectItem>
            <SelectItem value="zh">{t('languages.zh')}</SelectItem>
            <SelectItem value="ja">{t('languages.ja')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('settings.general.languageDescription')}</p>
      </div>

      {/* Thumbnail Resize Server */}
      <div className="space-y-2 py-6">
        <h3 className="text-base font-semibold">{t('settings.general.thumbnailServer')}</h3>
        <Input
          id="thumb-server"
          type="url"
          placeholder={presetContent.defaultThumbResizeServer || defaultResizeServer}
          value={config.thumbResizeServerUrl || ''}
          onChange={e => handleThumbServerChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('settings.general.thumbnailServerDescription')}
        </p>
      </div>

      {/* Search Service URL */}
      <div className="space-y-2 py-6">
        <h3 className="text-base font-semibold">
          {t('settings.general.searchServiceUrl', { defaultValue: 'Search Service URL' })}
        </h3>
        <Input
          id="search-service-url"
          type="url"
          placeholder={SEARCH_SERVICE_URL}
          value={config.searchServiceUrl || ''}
          onChange={e => handleSearchServiceUrlChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t('settings.general.searchServiceUrlDescription', {
            defaultValue:
              'Base URL of the external video search API. Leave empty to use the default.',
          })}
        </p>
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

        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="youtube-content" className="cursor-pointer font-medium">
              {t('settings.general.youtubeContent', { defaultValue: 'YouTube content' })}
            </Label>
            <p id="youtube-content-description" className="text-xs text-muted-foreground">
              {t('settings.general.youtubeContentDescription', {
                defaultValue: 'Show videos whose media source is a YouTube URL.',
              })}
            </p>
          </div>
          <Switch
            id="youtube-content"
            className="mt-0.5 shrink-0 sm:mt-0"
            checked={config.showYouTubeContent ?? true}
            onCheckedChange={handleYouTubeContentChange}
            aria-describedby="youtube-content-description"
          />
        </div>

        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="nsfw-filter" className="font-medium">
              {t('settings.general.nsfwFilter')}
            </Label>
          </div>
          <Select
            value={config.nsfwFilter ?? 'hide'}
            onValueChange={value => handleNsfwFilterChange(value as NsfwFilter)}
          >
            <SelectTrigger id="nsfw-filter" className="w-full max-w-sm shrink-0 sm:w-[360px]">
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

      {/* Default Video Quality */}
      <div className="py-6">
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:items-center sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="quality-select" className="font-medium">
              {t('settings.general.preferredQuality', { defaultValue: 'Default Video Quality' })}
            </Label>
            <p id="quality-description" className="text-xs text-muted-foreground">
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
            <SelectTrigger id="quality-select" className="w-full max-w-sm shrink-0 sm:w-[200px]">
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

      {/* Import Follows from Nostr Contacts */}
      {user && hasKind3Contacts && (
        <div className="space-y-3 py-6">
          <h3 className="text-base font-semibold">{t('settings.general.importFollows')}</h3>
          {importDone && importProgress.phase === 'done' ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {importProgress.withVideos > 0
                ? t('onboarding.followImport.successWithCount', {
                    count: importProgress.withVideos,
                  })
                : t('onboarding.followImport.noVideosFound')}
            </div>
          ) : isImporting ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {importProgress.phase === 'checking'
                    ? t('onboarding.followImport.checking')
                    : t('onboarding.followImport.importing')}
                </span>
                <span>
                  {importProgress.checked}/{importProgress.total}
                </span>
              </div>
              <Progress
                value={
                  importProgress.total > 0
                    ? Math.round((importProgress.checked / importProgress.total) * 100)
                    : 0
                }
                className="h-2"
              />
              {importProgress.withVideos > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('onboarding.followImport.foundWithVideos', {
                    count: importProgress.withVideos,
                  })}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cancelImport()
                  setIsImporting(false)
                }}
              >
                <X className="h-4 w-4 mr-1" />
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={async () => {
                  setIsImporting(true)
                  setImportDone(false)
                  try {
                    await importFromKind3()
                    setImportDone(true)
                  } finally {
                    setIsImporting(false)
                  }
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                {t('settings.general.importFollowsButton', { count: kind3PubkeyCount })}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t('settings.general.importFollowsDescription')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
