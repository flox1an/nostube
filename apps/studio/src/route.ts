import { useEffect, useState } from 'react'
import {
  BarChart3,
  FileText,
  Film,
  ListChecks,
  Palette,
  Settings,
  Upload,
  User,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export type PageId =
  | 'start'
  | 'videos'
  | 'upload'
  | 'moderation'
  | 'appearance'
  | 'sitePages'
  | 'instance'
  | 'account'
  | 'overview'
  | 'advanced'
export type GroupId = 'start' | 'content' | 'site' | 'server'

/** Stable ids only: the names shown are translated at render (`studio.nav.*`). */
export interface PageDef {
  id: PageId
  group: GroupId
  /** The page edits the config draft, so the save bar belongs under it. */
  editsConfig: boolean
  icon: LucideIcon
}

export const GROUPS: { id: GroupId }[] = [
  { id: 'start' },
  { id: 'content' },
  { id: 'site' },
  { id: 'server' },
]

export const PAGES: PageDef[] = [
  { id: 'start', group: 'start', editsConfig: false, icon: ListChecks },
  { id: 'upload', group: 'content', editsConfig: false, icon: Upload },
  { id: 'videos', group: 'content', editsConfig: false, icon: Film },
  { id: 'moderation', group: 'content', editsConfig: false, icon: ShieldCheck },
  { id: 'appearance', group: 'site', editsConfig: true, icon: Palette },
  { id: 'sitePages', group: 'site', editsConfig: true, icon: FileText },
  { id: 'instance', group: 'server', editsConfig: true, icon: Settings },
  { id: 'overview', group: 'server', editsConfig: false, icon: BarChart3 },
  { id: 'advanced', group: 'server', editsConfig: true, icon: Wrench },
  { id: 'account', group: 'server', editsConfig: false, icon: User },
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
