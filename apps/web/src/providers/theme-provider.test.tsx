import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { oceanTheme } from '@/lib/themes'
import { ThemeProvider, useTheme } from './theme-provider'

const themeInit = readFileSync(join(import.meta.dirname, '../../public/theme-init.js'), 'utf8')
const root = document.documentElement

function osPrefersDark(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(query => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

/** Saves a choice through the provider, then boots a fresh page with public/theme-init.js. */
function saveAndReload(mode: 'light' | 'dark' | 'system', palette: string) {
  let save!: () => void
  const Capture = () => {
    const { setTheme, setColorTheme } = useTheme()
    save = () => {
      setTheme(mode)
      setColorTheme(palette)
    }
    return null
  }
  const { unmount } = render(
    <ThemeProvider>
      <Capture />
    </ThemeProvider>
  )
  act(() => save())
  unmount()
  root.className = ''
  root.removeAttribute('style')
  new Function(themeInit)()
}

describe('theme-init.js', () => {
  beforeEach(() => {
    localStorage.clear()
    root.className = ''
    root.removeAttribute('style')
  })

  it('applies a saved explicit mode and palette regardless of the OS scheme', () => {
    osPrefersDark(false)
    saveAndReload('dark', 'ocean')
    expect(root.classList.value).toBe('dark')
    expect(root.style.getPropertyValue('--background')).toBe(oceanTheme.colors.dark.background)

    osPrefersDark(true)
    saveAndReload('light', 'ocean')
    expect(root.classList.value).toBe('light')
    expect(root.style.getPropertyValue('--card-foreground')).toBe(
      oceanTheme.colors.light.cardForeground
    )
  })

  it('follows the OS scheme in system mode and without a saved choice', () => {
    osPrefersDark(true)
    saveAndReload('system', 'ocean')
    expect(root.classList.value).toBe('dark')
    expect(root.style.getPropertyValue('--background')).toBe(oceanTheme.colors.dark.background)

    localStorage.clear()
    root.className = ''
    new Function(themeInit)()
    expect(root.classList.value).toBe('dark')
  })
})
