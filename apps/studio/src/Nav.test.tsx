import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileBar, Sidebar } from './Nav'
import { GROUPS, PAGES, type PageId } from './route'
import './i18n'

/** What each page is called in English; the sidebar shows the same name as the page header. */
const LABELS: Record<PageId, string> = {
  start: 'Getting started',
  videos: 'Videos',
  upload: 'Upload',
  moderation: 'Moderation',
  appearance: 'Appearance',
  sitePages: 'Pages',
  instance: 'General',
  overview: 'Statistics',
  advanced: 'Advanced',
  account: 'Account',
}
const GROUP_LABELS = {
  start: 'Start',
  content: 'Content',
  site: 'Website',
  server: 'Server',
} as const

describe('Sidebar', () => {
  it('shows every page in one list, under its group, and marks the current one', () => {
    render(
      <Sidebar
        page="appearance"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        instanceTitle="My videos"
      />
    )
    // One flat list: every page is reachable, not only the current group's.
    for (const p of PAGES.filter(p => p.id !== 'start')) {
      expect(screen.getByRole('button', { name: LABELS[p.id] })).toBeTruthy()
    }
    // Getting started has an entry only while a checklist is open.
    expect(screen.queryByRole('button', { name: /Getting started/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Appearance', current: 'page' })).toBeTruthy()
    for (const group of GROUPS.filter(g => g.id !== 'start')) {
      expect(screen.getByRole('heading', { name: GROUP_LABELS[group.id] })).toBeTruthy()
    }
    expect(screen.getByText('My videos')).toBeTruthy()
  })

  it('lists Getting started with its progress while the checklist is open', () => {
    render(
      <Sidebar
        page="videos"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        instanceTitle=""
        progress={{ done: 1, total: 5 }}
      />
    )
    expect(screen.getByRole('button', { name: /^Getting started\s*1\/5$/ })).toBeTruthy()
  })

  it('navigates to the page pressed', () => {
    const onNavigate = vi.fn()
    render(<Sidebar page="videos" onNavigate={onNavigate} onLogout={vi.fn()} instanceTitle="" />)
    fireEvent.click(screen.getByRole('button', { name: 'Moderation' }))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('moderation')
  })

  it('offers the ways out: the public site in a new tab, and logging out', () => {
    const onLogout = vi.fn()
    render(<Sidebar page="videos" onNavigate={vi.fn()} onLogout={onLogout} instanceTitle="" />)
    const site = screen.getByRole('link', { name: 'View site' })
    expect(site.getAttribute('href')).toBe('/')
    expect(site.getAttribute('target')).toBe('_blank')
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

describe('MobileBar', () => {
  it('opens the drawer, navigates from it and closes it', () => {
    const onNavigate = vi.fn()
    render(
      <MobileBar
        page="videos"
        onNavigate={onNavigate}
        onLogout={vi.fn()}
        instanceTitle="My videos"
      />
    )
    // The drawer is closed: no pages, only the bar.
    expect(screen.queryByRole('button', { name: 'Moderation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    // The same list as the sidebar, plus the ways out.
    expect(screen.getByRole('button', { name: 'Videos', current: 'page' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Moderation' }))
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith('moderation')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
