import { describe, expect, it } from 'vitest'
import { SITE_PAGE_MAX_CHARS, isPageText } from '@nostube/core/instance-config'
import { widgetResources } from '@nostube/widgets/i18n'
import { DEFAULT_PAGE_LANGUAGES, privacyPolicy } from './default-pages'

describe('standard privacy policy', () => {
  it('exists in every language the site speaks and fits a page', () => {
    expect([...DEFAULT_PAGE_LANGUAGES].sort()).toEqual(Object.keys(widgetResources).sort())
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const text = privacyPolicy(language, [])
      expect(isPageText(text), language).toBe(true)
      expect([...text!].length, language).toBeLessThan(SITE_PAGE_MAX_CHARS / 2)
      expect(text, language).not.toMatch(/\{(profile|relays)\}/)
    }
  })

  it('names the public profile lookup relays, or says the lookup stays local', () => {
    const relays = ['wss://purplepag.es', 'wss://index.hzrd149.com']
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const open = privacyPolicy(language, relays)!
      const local = privacyPolicy(language, [])!
      expect(open, language).toContain('wss://purplepag.es, wss://index.hzrd149.com')
      expect(local, language).not.toContain('wss://')
      expect(open, language).not.toBe(local)
    }
  })

  it('has no text for a language the site does not speak', () => {
    expect(privacyPolicy('xx', [])).toBeUndefined()
  })
})
