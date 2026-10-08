const STORAGE_KEY = 'nostube:search-history'
const MAX_HISTORY = 20

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function addSearchHistory(query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return getSearchHistory()
  const existing = getSearchHistory().filter(q => q !== trimmed)
  const updated = [trimmed, ...existing].slice(0, MAX_HISTORY)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export function removeSearchHistory(query: string): string[] {
  const updated = getSearchHistory().filter(q => q !== query)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}
