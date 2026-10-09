import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { registerWidgetTranslations, widgetResources } from '@nostube/widgets/i18n'
import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import ru from './locales/ru.json'
import zh from './locales/zh.json'
import ja from './locales/ja.json'

const studioResources = { en, de, fr, es, ru, zh, ja }

/** The operator's browser-local preference, shared with the web app, else the browser's. */
function storedLanguage(): string | null {
  try {
    return localStorage.getItem('i18nextLng')
  } catch {
    return null // storage blocked: follow the browser
  }
}

i18n.on('languageChanged', () => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
  }
})

i18n.use(initReactI18next).init({
  lng: storedLanguage() ?? (typeof navigator === 'undefined' ? 'en' : navigator.language),
  supportedLngs: Object.keys(widgetResources),
  load: 'languageOnly',
  fallbackLng: 'en',
  resources: Object.fromEntries(
    Object.entries(studioResources).map(([lng, translation]) => [lng, { translation }])
  ),
  interpolation: { escapeValue: false },
})
registerWidgetTranslations(i18n)

export default i18n
