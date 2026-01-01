import { Link, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Palette,
  Wallet,
  Radio,
  Server,
  Database,
  Trash2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsMenuItem {
  path: string
  labelKey: string
  icon: React.ElementType
}

const menuItems: SettingsMenuItem[] = [
  { path: 'general', labelKey: 'settings.general.title', icon: Settings },
  { path: 'presets', labelKey: 'settings.presets.title', icon: Palette },
  { path: 'wallet', labelKey: 'wallet.title', icon: Wallet },
  { path: 'relays', labelKey: 'settings.relays.title', icon: Radio },
  { path: 'blossom', labelKey: 'settings.blossom.title', icon: Server },
  { path: 'caching', labelKey: 'settings.caching.title', icon: Database },
  { path: 'cache', labelKey: 'settings.cache.title', icon: Trash2 },
  { path: 'missing-videos', labelKey: 'settings.missingVideos.title', icon: AlertTriangle },
]

function SettingsMenu() {
  const { t } = useTranslation()

  return (
    <nav className="space-y-1">
      {menuItems.map(item => (
        <Link
          key={item.path}
          to={`/settings/${item.path}`}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            'text-foreground'
          )}
        >
          <item.icon className="h-5 w-5 text-muted-foreground" />
          <span className="flex-1">{t(item.labelKey)}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </nav>
  )
}

function SettingsHeader() {
  const { t } = useTranslation()
  const location = useLocation()

  // Find current section from path
  const currentPath = location.pathname.replace('/settings/', '')
  const currentItem = menuItems.find(item => item.path === currentPath)

  return (
    <div className="flex items-center gap-3 mb-6">
      <Link
        to="/settings"
        className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-accent transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <h1 className="text-2xl font-bold">
        {currentItem ? t(currentItem.labelKey) : t('settings.title')}
      </h1>
    </div>
  )
}

export function SettingsLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const isIndex = location.pathname === '/settings'

  return (
    <div className="container mx-auto py-8 max-w-2xl px-4">
      {isIndex ? (
        <>
          <h1 className="text-3xl font-bold mb-6">{t('settings.title')}</h1>
          <SettingsMenu />
        </>
      ) : (
        <>
          <SettingsHeader />
          <Outlet />
        </>
      )}
    </div>
  )
}
