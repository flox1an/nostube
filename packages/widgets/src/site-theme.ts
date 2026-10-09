import type { InstanceSite, SiteFont } from '@nostube/core/instance-config'

const FONT_STACKS: Record<SiteFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
}

/** Black or white text, whichever reads better on the colour (WCAG relative luminance). */
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Black and white have equal contrast at a luminance of about 0.179; pick the better one.
  return luminance > 0.179 ? '#111111' : '#ffffff'
}

/**
 * Applies the creator's look: the accent replaces the primary colour (and the focus ring), the
 * font picks one of three system stacks. `--accent` stays alone: in the shared theme it is the
 * hover background, and a saturated colour there makes menus unreadable.
 */
export function applyTheme(site: InstanceSite, root: HTMLElement = document.documentElement) {
  const { accent, font } = site.theme
  root.style.setProperty('--primary', accent)
  root.style.setProperty('--primary-foreground', readableOn(accent))
  root.style.setProperty('--ring', accent)
  root.style.setProperty('--sidebar-primary', accent)
  root.style.setProperty('--sidebar-primary-foreground', readableOn(accent))
  root.style.fontFamily = FONT_STACKS[font]
}

/** The viewer's light or dark mode always follows the system. */
export function followSystemColorScheme(
  root: HTMLElement = document.documentElement,
  media: MediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
) {
  const apply = () => root.classList.toggle('dark', media.matches)
  apply()
  media.addEventListener('change', apply)
}
