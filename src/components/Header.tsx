import { LoginArea } from '@/components/auth/LoginArea'
import { Button } from '@/components/ui/button'
import { MenuIcon, Upload, Search, ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useTheme } from '@/providers/theme-provider'
import { getThemeById } from '@/lib/themes'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { GlobalSearchBar } from '@/components/GlobalSearchBar'
import { NotificationBell } from '@/components/NotificationBell'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

interface HeaderProps {
  transparent?: boolean
}

export function Header({ transparent = false }: HeaderProps) {
  const { t } = useTranslation()
  const { toggleSidebar } = useAppContext()
  const { scrollDirection, isAtTop } = useScrollDirection()
  const isMobile = useIsMobile()
  const { colorTheme } = useTheme()
  const currentTheme = getThemeById(colorTheme)
  const appTitle = currentTheme.appTitle || { text: 'nostube', imageUrl: '/nostube.svg' }
  const { user } = useCurrentUser()
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const location = useLocation()
  const isShortsPage = location.pathname.startsWith('/short/') || location.pathname === '/shorts'

  // On mobile: hide header when scrolling down (unless at top), show when scrolling up
  const shouldHide = isMobile && scrollDirection === 'down' && !isAtTop && !isSearchExpanded

  if (isMobile && isSearchExpanded) {
    return (
      <header
        className={`sticky top-0 z-50 bg-background flex items-center px-4 h-14 gap-2`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
      >
        <Button variant="ghost" size="icon" onClick={() => setIsSearchExpanded(false)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          {!isShortsPage && (
            <GlobalSearchBar isMobileExpanded onSearch={() => setIsSearchExpanded(false)} />
          )}
        </div>
      </header>
    )
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-transform duration-300 ${transparent ? '' : 'bg-background'} ${
        shouldHide ? '-translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
    >
      <div className={`w-full px-4 py-2 flex items-center justify-between h-14`}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <MenuIcon />
          </Button>
          <Link to="/" className="text-xl font-bold flex flex-row gap-2 items-center">
            <img className="w-8" src={appTitle.imageUrl} alt="logo" />
            {!isMobile && (
              <span className="relative">
                {appTitle.text}
                <span className="absolute -top-1 -right-6 text-[0.5rem] font-semibold text-muted-foreground">
                  {t('common.beta')}
                </span>
              </span>
            )}
          </Link>
        </div>

        <div className="flex-1 max-w-2xl mx-4 hidden lg:block">
          {!isShortsPage && <GlobalSearchBar />}
        </div>

        <div className="flex items-center gap-1 lg:gap-2">
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={() => setIsSearchExpanded(true)}>
              <Search className="h-5 w-5" />
            </Button>
          )}

          {user && (
            <Link to="/upload" className="hidden lg:block">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                {t('header.upload')}
              </Button>
            </Link>
          )}

          <NotificationBell />

          <LoginArea />
        </div>
      </div>
    </header>
  )
}
