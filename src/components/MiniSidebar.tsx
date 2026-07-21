import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useNavigationMenu } from '@/hooks/useNavigationMenu'

export function MiniSidebar() {
  const location = useLocation()
  const { compactItems } = useNavigationMenu()

  const navItems = compactItems

  return (
    <aside className="flex flex-col w-20 bg-background pt-4 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
      {navItems.map(item => {
        const isActive = location.pathname === item.href
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex flex-col items-center justify-center py-4 px-1 gap-1 rounded-r-lg transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <item.icon className={cn('h-6 w-6', isActive && !item.noFill && 'fill-current')} />
            <span className="text-[10px] font-medium text-center truncate w-full px-1">
              {item.label}
            </span>
          </Link>
        )
      })}
    </aside>
  )
}
