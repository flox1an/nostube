import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { registerWidgetTranslations, widgetResources } from '@nostube/widgets/i18n'

i18n.use(initReactI18next).init({
  lng: navigator.language.split('-')[0],
  fallbackLng: 'en',
  resources: { en: { translation: widgetResources.en } },
  interpolation: { escapeValue: false },
})
registerWidgetTranslations(i18n)

export default i18n
