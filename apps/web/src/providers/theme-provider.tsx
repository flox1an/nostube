import { createContext, useContext, useEffect, useState } from 'react'
import {
  applyTheme,
  COLOR_THEME_STORAGE_KEY,
  getThemeById,
  THEME_MODE_STORAGE_KEY,
  THEME_VARS_STORAGE_KEY,
  themeVars,
} from '@/lib/themes'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  colorTheme: string
  setColorTheme: (themeId: string) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  colorTheme: 'nostube',
  setColorTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

// The saved theme is applied before first paint by public/theme-init.js (#112); this provider
// keeps <html> in sync afterwards and stores what that script reads.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_MODE_STORAGE_KEY) as Theme) || 'system'
  )

  const [colorTheme, setColorThemeState] = useState<string>(
    () => localStorage.getItem(COLOR_THEME_STORAGE_KEY) || 'nostube'
  )

  // Apply mode and palette now and, in system mode, whenever the OS scheme changes
  useEffect(() => {
    const selectedTheme = getThemeById(colorTheme)
    localStorage.setItem(
      THEME_VARS_STORAGE_KEY,
      JSON.stringify({
        light: themeVars(selectedTheme, 'light'),
        dark: themeVars(selectedTheme, 'dark'),
      })
    )

    const root = window.document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const mode = theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme
      root.classList.remove('light', 'dark')
      root.classList.add(mode)
      applyTheme(selectedTheme, mode)
    }

    apply()
    if (theme !== 'system') return
    mediaQuery.addEventListener('change', apply)
    return () => mediaQuery.removeEventListener('change', apply)
  }, [theme, colorTheme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, theme)
      setTheme(theme)
    },
    colorTheme,
    setColorTheme: (themeId: string) => {
      localStorage.setItem(COLOR_THEME_STORAGE_KEY, themeId)
      setColorThemeState(themeId)
    },
  }

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
