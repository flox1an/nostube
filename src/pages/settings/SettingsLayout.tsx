import { NavLink, Outlet, useLocation } from 'react-router-dom'
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

function SettingsMenu({ onItemClick }: { onItemClick?: () => void }) {
  const { t } = useTranslation()

  return (
    <nav className="space-y-1">
      {menuItems.map(item => (
        <NavLink
          key={item.path}
          to={`/settings/${item.path}`}
          onClick={onItemClick}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
            )
          }
        >
          <item.icon className="h-4 w-4" />
          <span className="flex-1">{t(item.labelKey)}</span>
          <ChevronRight className="h-4 w-4 opacity-50" />
        </NavLink>
      ))}
    </nav>
  )
}

function SettingsIndex() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('settings.selectSection')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.selectSectionDescription')}</p>
      </div>
      <SettingsMenu />
    </div>
  )
}

export function SettingsLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const isIndex = location.pathname === '/settings'

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">{t('settings.title')}</h1>

      <div className="flex gap-8">
        {/* Sidebar menu - hidden on mobile when viewing a section */}
        <aside className={cn('w-64 shrink-0', !isIndex && 'hidden md:block')}>
          <SettingsMenu />
        </aside>

        {/* Content area */}
        <main className={cn('flex-1 min-w-0', isIndex && 'hidden md:block')}>
          {isIndex ? <SettingsIndex /> : <Outlet />}
        </main>
      </div>

      {/* Mobile: show menu as index */}
      {isIndex && (
        <div className="md:hidden">
          <SettingsMenu />
        </div>
      )}
    </div>
  )
}
