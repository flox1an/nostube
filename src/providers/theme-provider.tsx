import { createContext, useContext, useEffect, useState } from 'react'
import { applyTheme, getThemeById, nostubeTheme } from '@/lib/themes'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  colorThemeStorageKey?: string
}

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

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  colorThemeStorageKey = 'nostube-color-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  const [colorTheme, setColorThemeState] = useState<string>(
    () => localStorage.getItem(colorThemeStorageKey) || 'nostube'
  )

  // Determine the effective theme mode (light/dark)
  const getEffectiveMode = (): 'light' | 'dark' => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme as 'light' | 'dark'
  }

  // Apply theme colors when theme or colorTheme changes
  useEffect(() => {
    const root = window.document.documentElement
    const mode = getEffectiveMode()

    root.classList.remove('light', 'dark')
    root.classList.add(mode)

    // Apply color theme
    const selectedTheme = getThemeById(colorTheme)
    applyTheme(selectedTheme, mode)
  }, [theme, colorTheme])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const mode = mediaQuery.matches ? 'dark' : 'light'
      const selectedTheme = getThemeById(colorTheme)
      applyTheme(selectedTheme, mode)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, colorTheme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
    colorTheme,
    setColorTheme: (themeId: string) => {
      localStorage.setItem(colorThemeStorageKey, themeId)
      setColorThemeState(themeId)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
