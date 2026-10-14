import { PersistentCache } from './persistent-cache'

const MAX_HISTORY = 20

// Search history is user data, not a cache: namespaced, but never auto-cleared.
const history = new PersistentCache<string[]>({
  namespace: 'search-history',
  clearable: false,
})

export function getSearchHistory(): string[] {
  return history.get('recent') ?? []
}

export function addSearchHistory(query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return getSearchHistory()
  const updated = [trimmed, ...getSearchHistory().filter(q => q !== trimmed)].slice(0, MAX_HISTORY)
  history.set('recent', updated)
  return updated
}

export function removeSearchHistory(query: string): string[] {
  const updated = getSearchHistory().filter(q => q !== query)
  history.set('recent', updated)
  return updated
}
