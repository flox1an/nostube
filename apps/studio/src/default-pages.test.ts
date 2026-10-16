import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  SITE_PAGE_MAX_CHARS,
  isPageText,
} from '@nostube/core/instance-config'
import { widgetResources } from '@nostube/widgets/i18n'
import { DEFAULT_PAGE_LANGUAGES, privacyPolicy } from './default-pages'

describe('standard privacy policy', () => {
  it('exists in every language the site speaks and fits a page', () => {
    expect([...DEFAULT_PAGE_LANGUAGES].sort()).toEqual(Object.keys(widgetResources).sort())
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const text = privacyPolicy(language, [], false)
      expect(isPageText(text), language).toBe(true)
      expect([...text!].length, language).toBeLessThan(SITE_PAGE_MAX_CHARS / 2)
      expect(text, language).not.toMatch(/\{(profile|relays)\}/)
    }
  })

  it('always names public defaults and adds custom lookup relays without duplicates', () => {
    const extra = 'wss://profiles.example'
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const defaults = privacyPolicy(language, [], false)!
      const custom = privacyPolicy(language, [...DEFAULT_PROFILE_RELAYS, extra, extra], false)!
      for (const relay of DEFAULT_PROFILE_RELAYS) {
        expect(defaults, language).toContain(relay)
        expect(custom.split(relay), language).toHaveLength(2)
      }
      expect(custom.split(extra), language).toHaveLength(2)
    }
  })

  it('adds the play counter only when it is on', () => {
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const off = privacyPolicy(language, [], false)!
      const on = privacyPolicy(language, [], true)!
      const offSections = off.split('\n\n')
      const onSections = on.split('\n\n')
      // Only the short version changes and one section joins before what the server keeps.
      expect(
        onSections.filter((_, i) => i !== 1 && i !== 9),
        language
      ).toEqual(offSections.filter((_, i) => i !== 1))
      expect(onSections[1], language).not.toBe(offSections[1])
      expect(onSections[10], language).toBe(offSections[9])
      expect(isPageText(on), language).toBe(true)
      expect([...on].length, language).toBeLessThan(SITE_PAGE_MAX_CHARS / 2)
    }
  })

  it('has no text for a language the site does not speak', () => {
    expect(privacyPolicy('xx', [], false)).toBeUndefined()
  })
})
