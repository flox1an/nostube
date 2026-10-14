import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Button } from '@nostube/widgets/components/button'
import type { Tabs } from '@/components/author/shared'
import { TAP_TARGET } from '@/components/author/shared'

export interface AuthorTab {
  id: Tabs
  label: string
  count?: number
  show: boolean
}

/**
 * The author page's scrollable tab strip. Config-driven: pass the tab list with
 * visibility and counts, this renders pills linking to `<basePath>[/<tab>]`.
 */
export function AuthorTabs({
  basePath,
  activeTab,
  tabs,
}: {
  basePath: string
  activeTab: Tabs
  tabs: AuthorTab[]
}) {
  const getTabPath = (nextTab: Tabs) =>
    nextTab === 'overview' ? basePath : `${basePath}/${nextTab}`

  return (
    <>
      {/* Scrollable tab bar; the right-edge fade hints at more tabs (end padding clears it). */}
      <div className="-mx-4 overflow-x-auto scroll-smooth scrollbar-hide py-2 [mask-image:linear-gradient(to_left,transparent,black_24px)] sm:mx-0">
        <div className="flex min-w-max gap-2 pr-6 pl-4 sm:pl-0">
          {tabs
            .filter(tab => tab.show)
            .map(tab => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'outline'}
                size="sm"
                className={cn('shrink-0 rounded-full px-3.5', TAP_TARGET)}
                asChild
              >
                <Link to={getTabPath(tab.id)}>
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="text-xs font-normal tabular-nums opacity-70">{tab.count}</span>
                  )}
                </Link>
              </Button>
            ))}
        </div>
      </div>
    </>
  )
}
