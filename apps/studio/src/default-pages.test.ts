import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_RELAYS,
  REACHES,
  SITE_PAGE_MAX_CHARS,
  isPageText,
} from '@nostube/core/instance-config'
import { widgetResources } from '@nostube/widgets/i18n'
import { DEFAULT_PAGE_LANGUAGES, privacyPolicy } from './default-pages'

describe('standard privacy policy', () => {
  it('exists in every language the site speaks and fits a page', () => {
    expect([...DEFAULT_PAGE_LANGUAGES].sort()).toEqual(Object.keys(widgetResources).sort())
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      for (const reach of REACHES) {
        const text = privacyPolicy(language, reach, [])
        expect(isPageText(text), language).toBe(true)
        expect([...text!].length, language).toBeLessThan(SITE_PAGE_MAX_CHARS / 2)
        expect(text, language).not.toMatch(/\{(profile|relays)\}/)
      }
    }
  })

  it('in Public always names public defaults and adds custom lookup relays without duplicates', () => {
    const extra = 'wss://profiles.example'
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const defaults = privacyPolicy(language, 'public', [])!
      const custom = privacyPolicy(language, 'public', [...DEFAULT_PROFILE_RELAYS, extra, extra])!
      for (const relay of DEFAULT_PROFILE_RELAYS) {
        expect(defaults, language).toContain(relay)
        expect(custom.split(relay), language).toHaveLength(2)
      }
      expect(custom.split(extra), language).toHaveLength(2)
    }
  })

  it('in Private names no lookup relay, not even configured ones', () => {
    const extra = 'wss://profiles.example'
    for (const language of DEFAULT_PAGE_LANGUAGES) {
      const text = privacyPolicy(language, 'private', [extra])!
      for (const relay of [...DEFAULT_PROFILE_RELAYS, extra]) {
        expect(text, language).not.toContain(relay)
      }
    }
  })

  it('has no text for a language the site does not speak', () => {
    expect(privacyPolicy('xx', 'public', [])).toBeUndefined()
  })
})
