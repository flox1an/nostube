import { useEffect, useState } from 'react'

export type PageId = 'videos' | 'upload' | 'appearance' | 'instance' | 'account'
export type GroupId = 'content' | 'site' | 'server'

export interface PageDef {
  id: PageId
  label: string
  group: GroupId
  /** The page edits the config draft, so the save bar belongs under it. */
  editsConfig: boolean
}

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'site', label: 'Site' },
  { id: 'server', label: 'Server' },
]

export const PAGES: PageDef[] = [
  { id: 'videos', label: 'Videos', group: 'content', editsConfig: true },
  { id: 'upload', label: 'Upload', group: 'content', editsConfig: false },
  { id: 'appearance', label: 'Appearance', group: 'site', editsConfig: true },
  { id: 'instance', label: 'Instance', group: 'server', editsConfig: true },
  { id: 'account', label: 'Account', group: 'server', editsConfig: false },
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
