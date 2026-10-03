import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from './theme-provider'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
})

describe('theme startup', () => {
  it.each([
    { saved: 'dark', systemDark: false, mode: 'dark', background: 'oklch(0.15 0.02 220)' },
    { saved: 'system', systemDark: true, mode: 'dark', background: 'oklch(0.15 0.02 220)' },
    { saved: 'light', systemDark: true, mode: 'light', background: 'oklch(0.99 0.005 220)' },
    { saved: null, systemDark: true, mode: 'dark', background: 'oklch(0.15 0.02 220)' },
  ])(
    'applies $saved with systemDark=$systemDark before content effects',
    ({ saved, systemDark, mode, background }) => {
      if (saved) localStorage.setItem('nostr-tube-theme', saved)
      localStorage.setItem('nostube-color-theme', 'ocean')
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: systemDark,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList)

      let firstMode: string | undefined
      let firstBackground: string | undefined
      function Content() {
        useEffect(() => {
          firstMode = document.documentElement.className
          firstBackground = document.documentElement.style.getPropertyValue('--background')
        }, [])
        return <header>Navigation</header>
      }

      render(
        <ThemeProvider storageKey="nostr-tube-theme">
          <Content />
        </ThemeProvider>
      )

      expect(firstMode).toBe(mode)
      expect(firstBackground).toBe(background)
      expect(screen.getByRole('banner')).toBeVisible()
    }
  )
})

it('persists theme and palette switches for the next mount', () => {
  function Controls() {
    const { theme, colorTheme, setTheme, setColorTheme } = useTheme()
    return (
      <>
        <output>
          {theme}/{colorTheme}
        </output>
        <button onClick={() => setTheme('dark')}>Dark</button>
        <button onClick={() => setTheme('light')}>Light</button>
        <button onClick={() => setColorTheme('forest')}>Forest</button>
      </>
    )
  }

  const mounted = render(
    <ThemeProvider storageKey="nostr-tube-theme">
      <Controls />
    </ThemeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
  fireEvent.click(screen.getByRole('button', { name: 'Forest' }))
  expect(document.documentElement.className).toBe('dark')
  expect(document.documentElement.style.getPropertyValue('--background')).toBe(
    'oklch(0.15 0.02 150)'
  )
  expect(localStorage.getItem('nostr-tube-theme')).toBe('dark')
  expect(localStorage.getItem('nostube-color-theme')).toBe('forest')

  mounted.unmount()
  render(
    <ThemeProvider storageKey="nostr-tube-theme">
      <Controls />
    </ThemeProvider>
  )
  expect(screen.getByRole('status')).toHaveTextContent('dark/forest')
  fireEvent.click(screen.getByRole('button', { name: 'Light' }))
  expect(document.documentElement.className).toBe('light')
  expect(document.documentElement.style.getPropertyValue('--background')).toBe(
    'oklch(0.99 0.005 150)'
  )
  expect(localStorage.getItem('nostr-tube-theme')).toBe('light')
})
