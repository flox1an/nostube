/** 125 -> "2:05", 3725 -> "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatDate(unixSeconds: number, locale?: string): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(locale, { dateStyle: 'medium' })
}
