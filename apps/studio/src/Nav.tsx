import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, LogOut, Menu, X } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import { InterfaceLanguageSelect } from '@nostube/widgets/components/InterfaceLanguageSelect'
import { GROUPS, PAGES, type PageId } from './route'

/** One row of the sidebar list: an icon, the page name, an accent when it is the current page. */
function NavItem({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Menu
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium',
        'transition-[background-color,color,transform] duration-100 active:scale-[0.98]',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        'outline-sidebar-ring outline-offset-2 focus-visible:outline-2',
      ].join(' ')}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`} aria-hidden />
      <span className="flex min-w-0 flex-1 items-center truncate">{children}</span>
    </button>
  )
}

/** Every page in one list, grouped Content / Website / Server: what a studio is about. */
function SidebarNav({
  page,
  onNavigate,
  progress,
}: {
  page: PageId
  onNavigate: (page: PageId) => void
  /** Steps done and total while the checklist is open; without it the start page has no entry. */
  progress?: { done: number; total: number }
}) {
  const { t } = useTranslation()
  return (
    <nav
      className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-5"
      aria-label={t('studio.nav.sections')}
    >
      {GROUPS.filter(group => group.id !== 'start' || progress).map(group => (
        <section key={group.id}>
          <h2 className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t(`studio.nav.groups.${group.id}`)}
          </h2>
          <ul className="space-y-0.5">
            {PAGES.filter(p => p.group === group.id).map(p => (
              <li key={p.id}>
                <NavItem active={p.id === page} onClick={() => onNavigate(p.id)} icon={p.icon}>
                  {t(`studio.nav.pages.${p.id}`)}
                  {p.id === 'start' && progress && (
                    <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">
                      <span className="sr-only"> </span>
                      {progress.done}/{progress.total}
                    </span>
                  )}
                </NavItem>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

/** The studio's own things: the language of this browser, a way over to the public site and out. */
function SidebarFooter({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="pb-2 pl-0.5">
        <InterfaceLanguageSelect />
      </div>
      <ul className="space-y-0.5">
        <li>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-muted-foreground transition-[background-color,color] hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{t('studio.shell.viewSite')}</span>
          </a>
        </li>
        <li>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-muted-foreground transition-[background-color,color] hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{t('studio.shell.logOut')}</span>
          </button>
        </li>
      </ul>
      <p className="px-2.5 pt-3 text-[11px] text-muted-foreground">
        <a
          href="https://flox1an.github.io/nostube/server/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          powered by nostube-server
        </a>
      </p>
    </div>
  )
}

/**
 * The frame around every logged-in studio screen: which site this is, every page in one grouped
 * list (the current one marked), and at the bottom the ways out.
 */
export function Sidebar({
  page,
  onNavigate,
  onLogout,
  instanceTitle,
  progress,
}: {
  page: PageId
  onNavigate: (page: PageId) => void
  onLogout: () => void
  /** The site's own title, so the studio says whose studio it is. */
  instanceTitle: string
  progress?: { done: number; total: number }
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={`${import.meta.env.BASE_URL}nostube.svg`} alt="" className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{t('studio.shell.title')}</p>
          <p className="truncate text-xs text-muted-foreground">{instanceTitle}</p>
        </div>
      </div>
      <SidebarNav page={page} onNavigate={onNavigate} progress={progress} />
      <SidebarFooter onLogout={onLogout} />
    </div>
  )
}

/**
 * Below lg there is no room beside the content: a bar with the menu, the studio and the language;
 * the menu opens the sidebar as a drawer over the page.
 */
export function MobileBar({
  page,
  onNavigate,
  onLogout,
  instanceTitle,
  progress,
}: {
  page: PageId
  onNavigate: (page: PageId) => void
  onLogout: () => void
  instanceTitle: string
  progress?: { done: number; total: number }
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1.5 border-b border-sidebar-border bg-background/80 px-2.5 backdrop-blur-md sm:px-4 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('studio.nav.menu')}
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
        <img src={`${import.meta.env.BASE_URL}nostube.svg`} alt="" className="h-6 w-6 shrink-0" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{t('studio.shell.title')}</p>
        <InterfaceLanguageSelect />
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="anim-fade absolute inset-0 bg-foreground/25 dark:bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('studio.nav.sections')}
            className="anim-drawer absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-2xl"
          >
            <button
              type="button"
              aria-label={t('studio.nav.close')}
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <Sidebar
              page={page}
              onNavigate={next => {
                setOpen(false)
                onNavigate(next)
              }}
              onLogout={() => {
                setOpen(false)
                onLogout()
              }}
              instanceTitle={instanceTitle}
              progress={progress}
            />
          </div>
        </div>
      )}
    </>
  )
}
