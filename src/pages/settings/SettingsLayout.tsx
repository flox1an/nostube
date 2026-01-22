import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Settings, Palette, Radio, Server, Database, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SettingsMenuItem {
  path: string
  labelKey: string
  icon: React.ElementType
}

const menuItems: SettingsMenuItem[] = [
  { path: 'general', labelKey: 'settings.general.title', icon: Settings },
  { path: 'presets', labelKey: 'settings.presets.title', icon: Palette },
  { path: 'relays', labelKey: 'settings.relays.title', icon: Radio },
  { path: 'blossom', labelKey: 'settings.blossom.title', icon: Server },
  { path: 'caching', labelKey: 'settings.caching.title', icon: Database },
  { path: 'cache', labelKey: 'settings.cache.title', icon: Trash2 },
  { path: 'missing-videos', labelKey: 'settings.missingVideos.title', icon: AlertTriangle },
]

function SettingsTabs() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // Get current section from URL or default to general
  const currentPath = location.pathname.split('/').pop() || 'general'
  // Handle case where we might be at /settings (though we redirect, it's safe)
  const activePath = location.pathname === '/settings' ? 'general' : currentPath

  return (
    <div className="w-full overflow-x-auto scroll-smooth scrollbar-hide sticky top-[env(safe-area-inset-top,0)] z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-4 px-4 md:mx-0 md:px-0 mb-6 border-b md:border-none py-2">
      <div className="flex gap-2 min-w-max">
        {menuItems.map(item => {
          const isActive = activePath === item.path

          return (
            <Button
              key={item.path}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 rounded-full px-4 gap-2"
              onClick={() => navigate(`/settings/${item.path}`)}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export function SettingsLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const isIndex = location.pathname === '/settings'

  // Find current section from path
  const currentPath = location.pathname.split('/').pop()
  const currentMenuItem = menuItems.find(item => item.path === currentPath)

  useEffect(() => {
    if (isIndex) {
      document.title = `${t('settings.title')} - nostube`
    } else if (currentMenuItem) {
      document.title = `${t(currentMenuItem.labelKey)} - nostube`
    } else {
      document.title = `${t('settings.title')} - nostube`
    }
    return () => {
      document.title = 'nostube'
    }
  }, [t, isIndex, currentMenuItem])

  if (isIndex) {
    return <Navigate to="general" replace />
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl px-4">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
      </div>

      <SettingsTabs />

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  )
}
