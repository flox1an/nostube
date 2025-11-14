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
      background: 'oklch(1 0 0)',
      foreground: 'oklch(0.141 0.005 285.823)',
      card: 'oklch(1 0 0)',
      cardForeground: 'oklch(0.141 0.005 285.823)',
      popover: 'oklch(1 0 0)',
      popoverForeground: 'oklch(0.141 0.005 285.823)',
      primary: 'oklch(0.606 0.25 292.717)', // Purple
      primaryForeground: 'oklch(0.969 0.016 293.756)',
      secondary: 'oklch(0.967 0.001 286.375)',
      secondaryForeground: 'oklch(0.21 0.006 285.885)',
      muted: 'oklch(0.967 0.001 286.375)',
      mutedForeground: 'oklch(0.552 0.016 285.938)',
      accent: 'oklch(0.967 0.001 286.375)',
      accentForeground: 'oklch(0.21 0.006 285.885)',
      destructive: 'oklch(0.577 0.245 27.325)',
      border: 'oklch(0.92 0.004 286.32)',
      input: 'oklch(0.92 0.004 286.32)',
      ring: 'oklch(0.606 0.25 292.717)',
    },
    dark: {
      background: 'oklch(0.18 0.005 285.823)',
      foreground: 'oklch(0.985 0 0)',
      card: 'oklch(0.21 0.006 285.885)',
      cardForeground: 'oklch(0.985 0 0)',
      popover: 'oklch(0.21 0.006 285.885)',
      popoverForeground: 'oklch(0.985 0 0)',
      primary: 'oklch(0.541 0.281 293.009)', // Purple
      primaryForeground: 'oklch(0.969 0.016 293.756)',
      secondary: 'oklch(0.274 0.006 286.033)',
      secondaryForeground: 'oklch(0.985 0 0)',
      muted: 'oklch(0.274 0.006 286.033)',
      mutedForeground: 'oklch(0.705 0.015 286.067)',
      accent: 'oklch(0.274 0.006 286.033)',
      accentForeground: 'oklch(0.985 0 0)',
      destructive: 'oklch(0.704 0.191 22.216)',
      border: 'oklch(1 0 0 / 10%)',
      input: 'oklch(1 0 0 / 15%)',
      ring: 'oklch(0.541 0.281 293.009)',
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

export function applyTheme(theme: Theme, mode: 'light' | 'dark') {
  const root = document.documentElement
  const colors = mode === 'dark' ? theme.colors.dark : theme.colors.light

  root.style.setProperty('--background', colors.background)
  root.style.setProperty('--foreground', colors.foreground)
  root.style.setProperty('--card', colors.card)
  root.style.setProperty('--card-foreground', colors.cardForeground)
  root.style.setProperty('--popover', colors.popover)
  root.style.setProperty('--popover-foreground', colors.popoverForeground)
  root.style.setProperty('--primary', colors.primary)
  root.style.setProperty('--primary-foreground', colors.primaryForeground)
  root.style.setProperty('--secondary', colors.secondary)
  root.style.setProperty('--secondary-foreground', colors.secondaryForeground)
  root.style.setProperty('--muted', colors.muted)
  root.style.setProperty('--muted-foreground', colors.mutedForeground)
  root.style.setProperty('--accent', colors.accent)
  root.style.setProperty('--accent-foreground', colors.accentForeground)
  root.style.setProperty('--destructive', colors.destructive)
  root.style.setProperty('--border', colors.border)
  root.style.setProperty('--input', colors.input)
  root.style.setProperty('--ring', colors.ring)
}
