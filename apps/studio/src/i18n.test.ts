import { describe, expect, it } from 'vitest'
import i18n from './i18n'

describe('studio translations', () => {
  it('follows a supported browser language and falls back to English', async () => {
    await i18n.changeLanguage('de-AT')
    expect(i18n.resolvedLanguage).toBe('de')
    expect(document.documentElement.lang).toBe('de')
    await i18n.changeLanguage('pt-BR')
    expect(i18n.resolvedLanguage).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
