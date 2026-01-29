import { useState } from 'react'
import { useAppContext, useSelectedPreset, useFollowSet, useCurrentUser } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { type NsfwFilter } from '@/contexts/AppContext'
import { defaultResizeServer } from '../../App'
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

  const handleNsfwFilterChange = (value: NsfwFilter) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      nsfwFilter: value,
    }))
  }

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('settings.general.description')}</p>

      {/* Theme Mode */}
      <div className="space-y-3">
        <Label>{t('settings.general.themeMode')}</Label>
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
      <div className="space-y-2">
        <Label htmlFor="color-theme">{t('settings.general.colorTheme')}</Label>
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
      <div className="space-y-2">
        <Label htmlFor="language">{t('settings.general.language')}</Label>
        <Select value={i18n.language} onValueChange={handleLanguageChange}>
          <SelectTrigger id="language">
            <SelectValue placeholder={t('settings.general.selectLanguage')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t('languages.en')}</SelectItem>
            <SelectItem value="de">{t('languages.de')}</SelectItem>
            <SelectItem value="es">{t('languages.es')}</SelectItem>
            <SelectItem value="fr">{t('languages.fr')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('settings.general.languageDescription')}</p>
      </div>

      {/* Thumbnail Resize Server */}
      <div className="space-y-2">
        <Label htmlFor="thumb-server">{t('settings.general.thumbnailServer')}</Label>
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

      {/* NSFW Filter */}
      <div className="space-y-3">
        <Label>{t('settings.general.nsfwFilter')}</Label>
        <RadioGroup value={config.nsfwFilter ?? 'hide'} onValueChange={handleNsfwFilterChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="hide" id="nsfw-hide" />
            <Label htmlFor="nsfw-hide" className="font-normal cursor-pointer">
              {t('settings.general.nsfwHide')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="warning" id="nsfw-warning" />
            <Label htmlFor="nsfw-warning" className="font-normal cursor-pointer">
              {t('settings.general.nsfwWarning')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="show" id="nsfw-show" />
            <Label htmlFor="nsfw-show" className="font-normal cursor-pointer">
              {t('settings.general.nsfwShow')}
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.nsfwFilterDescription')}
        </p>
      </div>

      {/* Import Follows from Nostr Contacts */}
      {user && hasKind3Contacts && (
        <div className="space-y-3">
          <Label>{t('settings.general.importFollows')}</Label>
          {importDone && importProgress.phase === 'done' ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              {importProgress.withVideos > 0
                ? t('onboarding.followImport.successWithCount', { count: importProgress.withVideos })
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
                  {t('onboarding.followImport.foundWithVideos', { count: importProgress.withVideos })}
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
