/**
 * Theme configuration for nostube
 * Each theme defines colors for both light and dark modes
 */

export interface ThemeColors {
  light: {
    background: string
    foreground: string
    card: string
    cardForeground: string
    popover: string
    popoverForeground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
    destructive: string
    border: string
    input: string
    ring: string
  }
  dark: {
    background: string
    foreground: string
    card: string
    cardForeground: string
    popover: string
    popoverForeground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
    destructive: string
    border: string
    input: string
    ring: string
  }
}

export interface Theme {
  id: string
  name: string
  appTitle?: {
    text: string
    imageUrl: string
  }
  colors: ThemeColors
}

// Default nostube theme (current colors from index.css)
export const nostubeTheme: Theme = {
  id: 'nostube',
  name: 'Nostube',
  appTitle: {
    text: 'nostube',
    imageUrl: '/nostube.svg',
  },
  colors: {
    light: {
      background: 'oklch(0.982 0.002 286)',
      foreground: 'oklch(0.205 0.006 286)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.205 0.006 286)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.205 0.006 286)',
      primary: 'oklch(0.48 0.2 293)', // Deep violet for white-text contrast
      primaryForeground: 'oklch(0.969 0.016 293.756)',
      secondary: 'oklch(0.952 0.004 286)',
      secondaryForeground: 'oklch(0.21 0.006 285.885)',
      muted: 'oklch(0.952 0.004 286)',
      mutedForeground: 'oklch(0.49 0.012 286)',
      accent: 'oklch(0.945 0.012 293)',
      accentForeground: 'oklch(0.21 0.006 285.885)',
      destructive: 'oklch(0.577 0.245 27.325)',
      border: 'oklch(0.89 0.006 286)',
      input: 'oklch(0.89 0.006 286)',
      ring: 'oklch(0.55 0.17 293)',
    },
    dark: {
      background: 'oklch(0.16 0.006 286)',
      foreground: 'oklch(0.96 0.003 286)',
      card: 'oklch(0.205 0.007 286)',
      cardForeground: 'oklch(0.96 0.003 286)',
      popover: 'oklch(0.225 0.008 286)',
      popoverForeground: 'oklch(0.96 0.003 286)',
      primary: 'oklch(0.48 0.2 293)', // Deep violet for white-text contrast
      primaryForeground: 'oklch(0.969 0.016 293.756)',
      secondary: 'oklch(0.245 0.008 286)',
      secondaryForeground: 'oklch(0.985 0 0)',
      muted: 'oklch(0.245 0.008 286)',
      mutedForeground: 'oklch(0.7 0.01 286)',
      accent: 'oklch(0.275 0.018 293)',
      accentForeground: 'oklch(0.985 0 0)',
      destructive: 'oklch(0.704 0.191 22.216)',
      border: 'oklch(1 0 0 / 12%)',
      input: 'oklch(1 0 0 / 16%)',
      ring: 'oklch(0.68 0.16 293)',
    },
  },
}

// Ocean theme - Blue/Teal colors
export const oceanTheme: Theme = {
  id: 'ocean',
  name: 'Ocean',
  colors: {
    light: {
      background: 'oklch(0.99 0.005 220)',
      foreground: 'oklch(0.15 0.01 220)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.15 0.01 220)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.15 0.01 220)',
      primary: 'oklch(0.55 0.18 220)', // Blue
      primaryForeground: 'oklch(0.98 0.01 220)',
      secondary: 'oklch(0.96 0.01 220)',
      secondaryForeground: 'oklch(0.2 0.01 220)',
      muted: 'oklch(0.96 0.01 220)',
      mutedForeground: 'oklch(0.5 0.02 220)',
      accent: 'oklch(0.96 0.01 220)',
      accentForeground: 'oklch(0.2 0.01 220)',
      destructive: 'oklch(0.55 0.22 25)',
      border: 'oklch(0.91 0.01 220)',
      input: 'oklch(0.91 0.01 220)',
      ring: 'oklch(0.55 0.18 220)',
    },
    dark: {
      background: 'oklch(0.15 0.02 220)',
      foreground: 'oklch(0.98 0.01 220)',
      card: 'oklch(0.18 0.02 220)',
      cardForeground: 'oklch(0.98 0.01 220)',
      popover: 'oklch(0.18 0.02 220)',
      popoverForeground: 'oklch(0.98 0.01 220)',
      primary: 'oklch(0.60 0.20 200)', // Cyan/Blue
      primaryForeground: 'oklch(0.98 0.01 220)',
      secondary: 'oklch(0.25 0.02 220)',
      secondaryForeground: 'oklch(0.98 0.01 220)',
      muted: 'oklch(0.25 0.02 220)',
      mutedForeground: 'oklch(0.65 0.02 220)',
      accent: 'oklch(0.25 0.02 220)',
      accentForeground: 'oklch(0.98 0.01 220)',
      destructive: 'oklch(0.65 0.20 25)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: 'oklch(0.60 0.20 200)',
    },
  },
}

// Forest theme - Green colors
export const forestTheme: Theme = {
  id: 'forest',
  name: 'Forest',
  colors: {
    light: {
      background: 'oklch(0.99 0.005 150)',
      foreground: 'oklch(0.15 0.01 150)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.15 0.01 150)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.15 0.01 150)',
      primary: 'oklch(0.55 0.15 145)', // Green
      primaryForeground: 'oklch(0.98 0.01 150)',
      secondary: 'oklch(0.96 0.01 150)',
      secondaryForeground: 'oklch(0.2 0.01 150)',
      muted: 'oklch(0.96 0.01 150)',
      mutedForeground: 'oklch(0.5 0.02 150)',
      accent: 'oklch(0.96 0.01 150)',
      accentForeground: 'oklch(0.2 0.01 150)',
      destructive: 'oklch(0.55 0.22 25)',
      border: 'oklch(0.91 0.01 150)',
      input: 'oklch(0.91 0.01 150)',
      ring: 'oklch(0.55 0.15 145)',
    },
    dark: {
      background: 'oklch(0.15 0.02 150)',
      foreground: 'oklch(0.98 0.01 150)',
      card: 'oklch(0.18 0.02 150)',
      cardForeground: 'oklch(0.98 0.01 150)',
      popover: 'oklch(0.18 0.02 150)',
      popoverForeground: 'oklch(0.98 0.01 150)',
      primary: 'oklch(0.60 0.18 145)', // Green
      primaryForeground: 'oklch(0.98 0.01 150)',
      secondary: 'oklch(0.25 0.02 150)',
      secondaryForeground: 'oklch(0.98 0.01 150)',
      muted: 'oklch(0.25 0.02 150)',
      mutedForeground: 'oklch(0.65 0.02 150)',
      accent: 'oklch(0.25 0.02 150)',
      accentForeground: 'oklch(0.98 0.01 150)',
      destructive: 'oklch(0.65 0.20 25)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: 'oklch(0.60 0.18 145)',
    },
  },
}

// Sunset theme - Orange/Red colors
export const sunsetTheme: Theme = {
  id: 'sunset',
  name: 'Sunset',
  colors: {
    light: {
      background: 'oklch(0.99 0.005 30)',
      foreground: 'oklch(0.15 0.01 30)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.15 0.01 30)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.15 0.01 30)',
      primary: 'oklch(0.60 0.20 40)', // Orange
      primaryForeground: 'oklch(0.98 0.01 30)',
      secondary: 'oklch(0.96 0.01 30)',
      secondaryForeground: 'oklch(0.2 0.01 30)',
      muted: 'oklch(0.96 0.01 30)',
      mutedForeground: 'oklch(0.5 0.02 30)',
      accent: 'oklch(0.96 0.01 30)',
      accentForeground: 'oklch(0.2 0.01 30)',
      destructive: 'oklch(0.55 0.22 25)',
      border: 'oklch(0.91 0.01 30)',
      input: 'oklch(0.91 0.01 30)',
      ring: 'oklch(0.60 0.20 40)',
    },
    dark: {
      background: 'oklch(0.15 0.02 30)',
      foreground: 'oklch(0.98 0.01 30)',
      card: 'oklch(0.18 0.02 30)',
      cardForeground: 'oklch(0.98 0.01 30)',
      popover: 'oklch(0.18 0.02 30)',
      popoverForeground: 'oklch(0.98 0.01 30)',
      primary: 'oklch(0.65 0.22 35)', // Orange/Red
      primaryForeground: 'oklch(0.98 0.01 30)',
      secondary: 'oklch(0.25 0.02 30)',
      secondaryForeground: 'oklch(0.98 0.01 30)',
      muted: 'oklch(0.25 0.02 30)',
      mutedForeground: 'oklch(0.65 0.02 30)',
      accent: 'oklch(0.25 0.02 30)',
      accentForeground: 'oklch(0.98 0.01 30)',
      destructive: 'oklch(0.65 0.20 25)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: 'oklch(0.65 0.22 35)',
    },
  },
}

// Monochrome theme - Neutral grays
export const monochromeTheme: Theme = {
  id: 'monochrome',
  name: 'Monochrome',
  colors: {
    light: {
      background: 'oklch(0.99 0 0)',
      foreground: 'oklch(0.15 0 0)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.15 0 0)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.15 0 0)',
      primary: 'oklch(0.30 0 0)', // Dark gray
      primaryForeground: 'oklch(0.98 0 0)',
      secondary: 'oklch(0.96 0 0)',
      secondaryForeground: 'oklch(0.2 0 0)',
      muted: 'oklch(0.96 0 0)',
      mutedForeground: 'oklch(0.5 0 0)',
      accent: 'oklch(0.96 0 0)',
      accentForeground: 'oklch(0.2 0 0)',
      destructive: 'oklch(0.55 0.22 25)',
      border: 'oklch(0.91 0 0)',
      input: 'oklch(0.91 0 0)',
      ring: 'oklch(0.30 0 0)',
    },
    dark: {
      background: 'oklch(0.15 0 0)',
      foreground: 'oklch(0.98 0 0)',
      card: 'oklch(0.18 0 0)',
      cardForeground: 'oklch(0.98 0 0)',
      popover: 'oklch(0.18 0 0)',
      popoverForeground: 'oklch(0.98 0 0)',
      primary: 'oklch(0.70 0 0)', // Light gray
      primaryForeground: 'oklch(0.15 0 0)',
      secondary: 'oklch(0.25 0 0)',
      secondaryForeground: 'oklch(0.98 0 0)',
      muted: 'oklch(0.25 0 0)',
      mutedForeground: 'oklch(0.65 0 0)',
      accent: 'oklch(0.25 0 0)',
      accentForeground: 'oklch(0.98 0 0)',
      destructive: 'oklch(0.65 0.20 25)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: 'oklch(0.70 0 0)',
    },
  },
}

// YouTube type theme
export const youtubeTheme: Theme = {
  id: 'red',
  name: 'Red',
  appTitle: {
    text: 'NosTube',
    imageUrl: '/red.svg',
  },
  colors: {
    light: {
      background: 'oklch(0.99 0 0)',
      foreground: 'oklch(0.15 0 0)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.15 0 0)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.15 0 0)',
      primary: 'oklch(0.55 0.22 29)',
      primaryForeground: 'oklch(0.98 0 0)',
      secondary: 'oklch(0.96 0 0)',
      secondaryForeground: 'oklch(0.2 0 0)',
      muted: 'oklch(0.96 0 0)',
      mutedForeground: 'oklch(0.5 0 0)',
      accent: 'oklch(0.96 0 0)',
      accentForeground: 'oklch(0.2 0 0)',
      destructive: 'oklch(0.55 0.22 25)',
      border: 'oklch(0.91 0 0)',
      input: 'oklch(0.91 0 0)',
      ring: 'oklch(0.55 0.22 29)',
    },
    dark: {
      background: 'oklch(0.14 0 0)', // YouTube dark background (#0F0F0F)
      foreground: 'oklch(0.98 0 0)',
      card: 'oklch(0.17 0 0)', // YouTube card background (#212121)
      cardForeground: 'oklch(0.98 0 0)',
      popover: 'oklch(0.17 0 0)',
      popoverForeground: 'oklch(0.98 0 0)',
      primary: 'oklch(0.60 0.24 29)', // YouTube Red (brighter for dark mode)
      primaryForeground: 'oklch(0.98 0 0)',
      secondary: 'oklch(0.22 0 0)', // YouTube secondary dark (#272727)
      secondaryForeground: 'oklch(0.98 0 0)',
      muted: 'oklch(0.22 0 0)',
      mutedForeground: 'oklch(0.68 0 0)', // YouTube muted text (#AAAAAA)
      accent: 'oklch(0.22 0 0)',
      accentForeground: 'oklch(0.98 0 0)',
      destructive: 'oklch(0.65 0.20 25)',
      border: 'oklch(1 0 0 / 8%)', // Subtle borders
      input: 'oklch(1 0 0 / 12%)',
      ring: 'oklch(0.60 0.24 29)',
    },
  },
}

export const availableThemes: Theme[] = [
  nostubeTheme,
  youtubeTheme,
  oceanTheme,
  forestTheme,
  sunsetTheme,
  monochromeTheme,
]

export function getThemeById(id: string): Theme {
  return availableThemes.find(t => t.id === id) || nostubeTheme
}

/** Saved mode ('light' | 'dark' | 'system'); read before first paint by public/theme-init.js. */
export const THEME_MODE_STORAGE_KEY = 'nostr-tube-theme'
/** Saved palette id (a `Theme.id`). */
export const COLOR_THEME_STORAGE_KEY = 'nostube-color-theme'
/** CSS variables of the saved palette per mode, applied before first paint by public/theme-init.js. */
export const THEME_VARS_STORAGE_KEY = 'nostube-theme-vars'

/** The palette's CSS custom properties for one mode, e.g. `cardForeground` → `--card-foreground`. */
export function themeVars(theme: Theme, mode: 'light' | 'dark'): Record<string, string> {
  return Object.fromEntries(
    Object.entries(theme.colors[mode]).map(([key, value]) => [
      `--${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`,
      value,
    ])
  )
}

export function applyTheme(theme: Theme, mode: 'light' | 'dark') {
  const root = document.documentElement
  for (const [name, value] of Object.entries(themeVars(theme, mode))) {
    root.style.setProperty(name, value)
  }
}
