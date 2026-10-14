import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nostube/widgets/components/select'
import { RadioGroup, RadioGroupItem } from '@nostube/widgets/components/radio-group'
import { Label } from '@nostube/widgets/components/label'
import { useTheme } from '@/providers/theme-provider'
import { availableThemes } from '@/lib/themes'
import { useInstallState } from '@/hooks/useInstallState'
import { getInstallMode, promptInstall } from '@/lib/install-prompt'
import { IosInstallDialog } from '@/components/InstallHint'

export function AppearanceSection() {
  const { theme, setTheme, colorTheme, setColorTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const installMode = getInstallMode(useInstallState())
  const [isIosInstallOpen, setIsIosInstallOpen] = useState(false)

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div className="divide-y divide-border">
      {/* Theme Mode */}
      <div className="space-y-3 pb-6">
        <h3 id="appearance-theme-mode-label" className="text-base font-semibold">
          {t('settings.general.themeMode')}
        </h3>
        <RadioGroup
          aria-labelledby="appearance-theme-mode-label"
          value={theme}
          onValueChange={value => setTheme(value as 'light' | 'dark' | 'system')}
        >
          <Label
            htmlFor="appearance-theme-light"
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 font-normal cursor-pointer hover:bg-accent has-[[data-state=checked]]:bg-accent"
          >
            <RadioGroupItem value="light" id="appearance-theme-light" />
            {t('settings.general.light')}
          </Label>
          <Label
            htmlFor="appearance-theme-dark"
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 font-normal cursor-pointer hover:bg-accent has-[[data-state=checked]]:bg-accent"
          >
            <RadioGroupItem value="dark" id="appearance-theme-dark" />
            {t('settings.general.dark')}
          </Label>
          <Label
            htmlFor="appearance-theme-system"
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 font-normal cursor-pointer hover:bg-accent has-[[data-state=checked]]:bg-accent"
          >
            <RadioGroupItem value="system" id="appearance-theme-system" />
            {t('settings.general.system')}
          </Label>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.themeModeDescription')}
        </p>
      </div>

      {/* Color Theme */}
      <div className="space-y-2 py-6">
        <h3 id="appearance-color-theme-label" className="text-base font-semibold">
          {t('settings.general.colorTheme')}
        </h3>
        <Select value={colorTheme} onValueChange={setColorTheme}>
          <SelectTrigger id="appearance-color-theme" aria-labelledby="appearance-color-theme-label">
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
        <h3 id="appearance-language-label" className="text-base font-semibold">
          {t('settings.general.language')}
        </h3>
        <Select value={i18n.resolvedLanguage} onValueChange={handleLanguageChange}>
          <SelectTrigger id="appearance-language" aria-labelledby="appearance-language-label">
            <SelectValue placeholder={t('settings.general.selectLanguage')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">🇺🇸 {t('languages.en')}</SelectItem>
            <SelectItem value="de">🇩🇪 {t('languages.de')}</SelectItem>
            <SelectItem value="es">🇪🇸 {t('languages.es')}</SelectItem>
            <SelectItem value="fr">🇫🇷 {t('languages.fr')}</SelectItem>
            <SelectItem value="ru">🇷🇺 {t('languages.ru')}</SelectItem>
            <SelectItem value="zh">🇨🇳 {t('languages.zh')}</SelectItem>
            <SelectItem value="ja">🇯🇵 {t('languages.ja')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('settings.general.languageDescription')}</p>
      </div>

      {/* Install app (hidden once installed or running standalone) */}
      {installMode && (
        <div className="space-y-2 py-6">
          <h3 className="text-base font-semibold">{t('install.title')}</h3>
          <Button
            variant="outline"
            onClick={() =>
              installMode === 'prompt' ? void promptInstall() : setIsIosInstallOpen(true)
            }
          >
            <Download />
            {t('install.install')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('install.settingsDescription')}</p>
          <IosInstallDialog open={isIosInstallOpen} onOpenChange={setIsIosInstallOpen} />
        </div>
      )}
    </div>
  )
}
