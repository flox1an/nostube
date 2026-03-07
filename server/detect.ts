// Matches common browser engines — if the UA contains these, it's a real user browser
const BROWSER_PATTERN = /Mozilla\/|Chrome\/|Safari\/|Firefox\/|Edge\/|Opera\/|OPR\//i

export function isBrowser(userAgent: string | undefined): boolean {
  if (!userAgent) return false
  return BROWSER_PATTERN.test(userAgent)
}
