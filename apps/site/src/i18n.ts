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

const supportedLngs = Object.keys(widgetResources)

/**
 * The site has no language setting: it speaks the visitor's first browser language it supports
 * (`de-AT` counts as `de`), otherwise English.
 */
export function browserLanguage(preferred: readonly string[]): string {
  return (
    preferred
      .map(tag => tag.split('-')[0].toLowerCase())
      .find(lng => supportedLngs.includes(lng)) ?? 'en'
  )
}

// Registered before init, so the first resolution sets `<html lang>` too.
i18n.on('languageChanged', () => {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'en'
})

i18n.use(initReactI18next).init({
  lng: browserLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]),
  supportedLngs,
  load: 'languageOnly',
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    es: { translation: es },
    ru: { translation: ru },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  interpolation: { escapeValue: false },
})
// The shared widgets bring their own strings; keys defined above win.
registerWidgetTranslations(i18n)

export default i18n
