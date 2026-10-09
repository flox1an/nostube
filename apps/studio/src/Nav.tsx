import { useTranslation } from 'react-i18next'
import { GROUPS, PAGES, type PageId } from './route'

/** Two levels: the group on top, the pages of the current group below (when it has several). */
export function Nav({ page, onNavigate }: { page: PageId; onNavigate: (page: PageId) => void }) {
  const { t } = useTranslation()
  const current = PAGES.find(p => p.id === page)!
  const siblings = PAGES.filter(p => p.group === current.group)

  const tab = (active: boolean) =>
    `-mb-px border-b-2 px-3 py-2 text-sm ${
      active
        ? 'border-primary font-medium'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="space-y-2">
      <nav className="flex gap-1 border-b border-border" aria-label={t('studio.nav.sections')}>
        {GROUPS.map(group => {
          const first = PAGES.find(p => p.group === group.id)!
          const active = group.id === current.group
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onNavigate(first.id)}
              aria-current={active ? 'page' : undefined}
              className={tab(active)}
            >
              {t(`studio.nav.groups.${group.id}`)}
            </button>
          )
        })}
      </nav>
      {siblings.length > 1 && (
        <nav
          className="flex gap-1"
          aria-label={t('studio.nav.groupPages', {
            group: t(`studio.nav.groups.${current.group}`),
          })}
        >
          {siblings.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onNavigate(p.id)}
              aria-current={p.id === page ? 'page' : undefined}
              className={`rounded-md px-3 py-1 text-sm ${
                p.id === page
                  ? 'bg-secondary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`studio.nav.pages.${p.id}`)}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
