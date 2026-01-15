import { Home, Play, Users, ListVideo } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks'

export function MiniSidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { user } = useCurrentUser()

  const navItems = [
    {
      label: t('navigation.home'),
      icon: Home,
      href: '/',
    },
    {
      label: t('navigation.shorts'),
      icon: Play,
      href: '/shorts',
    },
    // Only show Subscriptions and Playlists when logged in
    ...(user
      ? [
          {
            label: t('navigation.subscriptions'),
            icon: Users,
            href: '/subscriptions',
          },
          {
            label: t('navigation.playlists'),
            icon: ListVideo,
            href: '/playlists',
          },
        ]
      : []),
  ]

  return (
    <aside className="flex flex-col w-20 bg-background border-r border-border pt-4 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
      {navItems.map(item => {
        const isActive = location.pathname === item.href
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex flex-col items-center justify-center py-4 px-1 gap-1 hover:bg-accent transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <item.icon className={cn('h-6 w-6', isActive && 'fill-current')} />
            <span className="text-[10px] font-medium text-center truncate w-full px-1">
              {item.label}
            </span>
          </Link>
        )
      })}
    </aside>
  )
}
