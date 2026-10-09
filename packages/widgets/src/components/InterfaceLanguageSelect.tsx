import { useTranslation } from 'react-i18next'
import { widgetResources } from '../i18n'
import { LANGUAGES } from '../languages'

const interfaceLanguages = LANGUAGES.filter(language => language.code in widgetResources)

/** A browser-local operator preference; public sites use browser language instead. */
export function InterfaceLanguageSelect() {
  const { t, i18n } = useTranslation()

  return (
    <select
      aria-label={t('common.interfaceLanguage')}
      value={i18n.resolvedLanguage ?? 'en'}
      onChange={event => {
        const language = event.target.value
        void i18n.changeLanguage(language)
        try {
          localStorage.setItem('i18nextLng', language)
        } catch {
          // Language switching still works when browser storage is disabled.
        }
      }}
      className="h-9 max-w-32 rounded-md border border-input bg-background px-2 text-sm"
    >
      {interfaceLanguages.map(language => (
        <option key={language.code} value={language.code}>
          {language.name}
        </option>
      ))}
    </select>
  )
}
