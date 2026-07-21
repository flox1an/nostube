import { MenuIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { useAppContext, useIsMobile } from '@/hooks'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/providers/theme-provider'
import { getThemeById } from '@/lib/themes'
import { cn } from '@/lib/utils'
import { useNavigationMenu } from '@/hooks/useNavigationMenu'
import { useTranslation } from 'react-i18next'

export function Sidebar({ mode = 'auto' }: { mode?: 'drawer' | 'inline' | 'auto' }) {
  const { t } = useTranslation()
  const { toggleSidebar } = useAppContext()
  const { colorTheme } = useTheme()
  const currentTheme = getThemeById(colorTheme)
  const appTitle = currentTheme.appTitle || { text: 'nostube', imageUrl: '/nostube.svg' }
  const isMobile = useIsMobile()
  const location = useLocation()
  const isDrawer = mode === 'drawer' || (mode === 'auto' && isMobile)
  const { navigationItems, libraryItems, configurationItems } = useNavigationMenu()

  const handleItemClick = () => {
    if (isDrawer) {
      toggleSidebar()
    }
  }

  return (
    <aside
      className={cn(
        'flex flex-col w-56 bg-background transition-all duration-300 overflow-y-auto',
        isDrawer
          ? 'h-full shadow-lg backdrop-blur-sm bg-background/95'
          : 'sticky top-14 h-[calc(100vh-3.5rem)]'
      )}
      style={{
        paddingTop: isDrawer ? 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' : '1rem',
      }}
    >
      <div className="flex flex-col h-full">
        {isDrawer && (
          <div className="flex items-center gap-2 px-4 h-14 shrink-0">
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              <MenuIcon />
            </Button>
            <Link
              to="/"
              onClick={toggleSidebar}
              className="text-xl font-bold flex flex-row gap-2 items-center"
            >
              <img className="w-8" src={appTitle.imageUrl} alt="logo" />
              <span className="relative">
                {appTitle.text}
                <span className="absolute -top-1 -right-6 text-[0.5rem] font-semibold text-muted-foreground">
                  {t('common.beta')}
                </span>
              </span>
            </Link>
          </div>
        )}
        <nav className="px-2">
          {navigationItems.map(item => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={handleItemClick}
                className={cn(
                  'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                  isActive ? 'bg-accent' : 'hover:bg-accent'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {libraryItems.length > 0 && (
          <>
            <Separator className="my-4" />
            <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">
              {t('navigation.library')}
            </h2>
            <nav className="px-2">
              {libraryItems.map(item => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    onClick={handleItemClick}
                    className={cn(
                      'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                      isActive ? 'bg-accent' : 'hover:bg-accent'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          </>
        )}

        <Separator className="my-4" />
        <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">
          {t('navigation.configuration')}
        </h2>
        <nav className="px-2">
          {configurationItems.map(item => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={handleItemClick}
                className={cn(
                  'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                  isActive ? 'bg-accent' : 'hover:bg-accent'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
