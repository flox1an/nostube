import { Home, Play, Users, ListVideo } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

export function MobileBottomNav() {
  const { t } = useTranslation()
  const location = useLocation()

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

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-background/95 backdrop-blur-sm border-t border-border px-2 pb-safe-area-inset-bottom h-16 lg:hidden">
      {navItems.map(item => {
        const isActive = location.pathname === item.href
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 w-full h-full transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <item.icon className={cn('h-5 w-5', isActive && 'fill-current')} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
