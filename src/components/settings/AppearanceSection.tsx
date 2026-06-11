import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useTheme } from '@/providers/theme-provider'
import { availableThemes } from '@/lib/themes'

export function AppearanceSection() {
  const { theme, setTheme, colorTheme, setColorTheme } = useTheme()
  const { t, i18n } = useTranslation()

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div className="divide-y divide-border">
      {/* Theme Mode */}
      <div className="space-y-3 pb-6">
        <h3 className="text-base font-semibold">{t('settings.general.themeMode')}</h3>
        <RadioGroup
          value={theme}
          onValueChange={value => setTheme(value as 'light' | 'dark' | 'system')}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" id="appearance-theme-light" />
            <Label htmlFor="appearance-theme-light" className="font-normal cursor-pointer">
              {t('settings.general.light')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" id="appearance-theme-dark" />
            <Label htmlFor="appearance-theme-dark" className="font-normal cursor-pointer">
              {t('settings.general.dark')}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="system" id="appearance-theme-system" />
            <Label htmlFor="appearance-theme-system" className="font-normal cursor-pointer">
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
          <SelectTrigger id="appearance-color-theme">
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
          <SelectTrigger id="appearance-language">
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
    </div>
  )
}
