import { useEffect, useState } from 'react'

export type PageId = 'videos' | 'upload' | 'appearance' | 'instance' | 'account' | 'overview'
export type GroupId = 'content' | 'site' | 'server'

/** Stable ids only: the names shown are translated at render (`studio.nav.*`). */
export interface PageDef {
  id: PageId
  group: GroupId
  /** The page edits the config draft, so the save bar belongs under it. */
  editsConfig: boolean
}

export const GROUPS: { id: GroupId }[] = [{ id: 'content' }, { id: 'site' }, { id: 'server' }]

export const PAGES: PageDef[] = [
  { id: 'videos', group: 'content', editsConfig: true },
  { id: 'upload', group: 'content', editsConfig: false },
  { id: 'appearance', group: 'site', editsConfig: true },
  { id: 'instance', group: 'server', editsConfig: true },
  { id: 'account', group: 'server', editsConfig: false },
  { id: 'overview', group: 'server', editsConfig: false },
]

export const DEFAULT_PAGE: PageId = 'videos'

/** `#/appearance` to a page; anything unknown leads to the start page. */
export function pageFromHash(hash: string): PageId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return PAGES.find(p => p.id === id)?.id ?? DEFAULT_PAGE
}

export const hashFor = (id: PageId) => `#/${id}`

/** The page named by the address (a hash, so a reload stays where it was and the server needs no routes). */
export function useRoute(): [PageId, (page: PageId) => void] {
  const [page, setPage] = useState(() => pageFromHash(location.hash))
  useEffect(() => {
    const onChange = () => setPage(pageFromHash(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return [
    page,
    next => {
      location.hash = hashFor(next)
    },
  ]
}
