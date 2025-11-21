import { useAppContext } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useTranslation } from 'react-i18next'

export function GeneralSettingsSection() {
  const { config, updateConfig } = useAppContext()
  const { theme, setTheme, colorTheme, setColorTheme } = useTheme()
  const { t, i18n } = useTranslation()

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
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.general.title')}</CardTitle>
        <CardDescription>{t('settings.general.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <p className="text-xs text-muted-foreground">
            {t('settings.general.languageDescription')}
          </p>
        </div>

        {/* Thumbnail Resize Server */}
        <div className="space-y-2">
          <Label htmlFor="thumb-server">{t('settings.general.thumbnailServer')}</Label>
          <Input
            id="thumb-server"
            type="url"
            placeholder={defaultResizeServer}
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
          <RadioGroup value={config.nsfwFilter} onValueChange={handleNsfwFilterChange}>
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
      </CardContent>
    </Card>
  )
}
