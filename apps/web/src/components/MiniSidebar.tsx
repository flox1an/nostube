import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNavigationMenu } from '@/hooks/useNavigationMenu'

export function MiniSidebar() {
  const location = useLocation()
  const { compactItems } = useNavigationMenu()

  const navItems = compactItems

  return (
    <aside className="sticky top-16 ml-3 mb-3 flex h-[calc(100vh-5rem)] w-[4.5rem] flex-col overflow-y-auto rounded-3xl border border-foreground/10 bg-card/40 pt-3 shadow-[0_10px_40px_-20px_rgb(0_0_0/0.5)] backdrop-blur-md scrollbar-hide">
      {navItems.map(item => {
        const isActive = location.pathname === item.href.split('?')[0]
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'group/nav flex flex-col items-center justify-center py-3 px-1 gap-1 transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'flex h-8 w-12 items-center justify-center rounded-full border transition-colors',
                isActive
                  ? 'border-white/30 bg-primary text-primary-foreground'
                  : 'border-transparent group-hover/nav:border-foreground/30'
              )}
            >
              <item.icon className="h-5 w-5" />
            </span>
            <span className="text-[10px] font-medium text-center truncate w-full px-1">
              {item.label}
            </span>
          </Link>
        )
      })}
    </aside>
  )
}
