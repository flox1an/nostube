import en from './en.json'
import de from './de.json'
import fr from './fr.json'
import es from './es.json'
import ru from './ru.json'
import zh from './zh.json'
import ja from './ja.json'

/** The translations the widgets use, per language (i18next `translation` namespace). */
export const widgetResources = { en, de, fr, es, ru, zh, ja }

/** The part of i18next the registration needs. */
interface ResourceBundleHost {
  addResourceBundle(
    lng: string,
    ns: string,
    resources: object,
    deep?: boolean,
    overwrite?: boolean
  ): unknown
}

/**
 * Merges the widget translations into the host's i18next instance. Keys the host already defines
 * win. Call it once, right after i18next is initialised.
 */
export function registerWidgetTranslations(i18n: ResourceBundleHost) {
  for (const [lng, resources] of Object.entries(widgetResources)) {
    i18n.addResourceBundle(lng, 'translation', resources, true, false)
  }
}
