import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { widgetResources } from '../i18n'
import { InterfaceLanguageSelect } from './InterfaceLanguageSelect'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('interface language selection', () => {
  it.each([false, true])('switches language with blocked storage: %s', async blocked => {
    const i18n = createInstance()
    await i18n.init({
      lng: 'de',
      fallbackLng: 'en',
      resources: Object.fromEntries(
        Object.entries(widgetResources).map(([language, translation]) => [
          language,
          { translation },
        ])
      ),
    })
    if (blocked) {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError')
      })
    }
    render(
      <I18nextProvider i18n={i18n}>
        <InterfaceLanguageSelect />
      </I18nextProvider>
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Sprache' }), {
      target: { value: 'ja' },
    })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '言語' })).toBeTruthy()
      expect(i18n.resolvedLanguage).toBe('ja')
    })
    if (!blocked) expect(localStorage.getItem('i18nextLng')).toBe('ja')
  })
})
