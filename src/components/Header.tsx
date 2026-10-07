import { LoginArea } from '@/components/auth/LoginArea'
import { Button } from '@/components/ui/button'
import { MenuIcon, Upload, Search, ArrowLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useTheme } from '@/providers/theme-provider'
import { getThemeById } from '@/lib/themes'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { GlobalSearchBar } from '@/components/GlobalSearchBar'
import { isSearchOff } from '@/lib/search-client'
import { NotificationBell } from '@/components/NotificationBell'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { cn } from '@/lib/utils'

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
  const navigate = useNavigate()
  const isVideoPage = location.pathname.startsWith('/v/') || location.pathname.startsWith('/video/')

  // Only real in-app history (idx > 0) can be popped back into; a
  // direct-linked/refreshed video has none, so fall back to Home.
  const handleBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  // On mobile: hide header when scrolling down (unless at top), show when scrolling up
  const shouldHide = isMobile && scrollDirection === 'down' && !isAtTop && !isSearchExpanded
  // Video page at the top (dark theme only): no background/border, so the player's glow
  // shows through. Scrolled, the regular background returns so content never runs under
  // bare text.
  const blendWithPage = isVideoPage && isAtTop && !transparent
  // Light theme: a very light gray tint over the page; dark theme: the page color.
  const barBackground =
    'bg-sidebar/90 supports-[backdrop-filter]:bg-sidebar/80 dark:bg-background/90 dark:supports-[backdrop-filter]:bg-background/80'

  if (isMobile && isSearchExpanded) {
    return (
      <header
        className={`sticky top-0 z-50 flex h-14 items-center gap-2 border-b border-border/70 px-4 backdrop-blur-xl ${barBackground}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
      >
        <Button variant="ghost" size="icon" onClick={() => setIsSearchExpanded(false)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <GlobalSearchBar isMobileExpanded onSearch={() => setIsSearchExpanded(false)} />
        </div>
      </header>
    )
  }

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-[transform,background-color,border-color] duration-300 ${isAtTop ? '' : 'backdrop-blur-xl'} ${transparent ? 'border-border/70' : `border-border/70 ${barBackground}`} ${blendWithPage ? 'dark:border-transparent dark:bg-transparent dark:supports-[backdrop-filter]:bg-transparent' : ''} ${
        shouldHide ? '-translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
    >
      <div className={`w-full px-4 py-2 flex items-center justify-between h-14`}>
        <div className="flex items-center gap-2">
          {isVideoPage ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              aria-label={t('video.back', 'Back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={t('navigation.menu', 'Menu')}
              className="hidden lg:inline-flex"
            >
              <MenuIcon />
            </Button>
          )}
          <Link
            to="/"
            className={cn(
              'text-xl font-bold flex flex-row gap-2 items-center',
              transparent ? 'text-white' : 'text-foreground'
            )}
          >
            <img className="w-8" src={appTitle.imageUrl} alt="logo" />
            <span className="relative">
              {appTitle.text}
              <span
                className={cn(
                  'absolute -top-1 -right-6 text-[0.5rem] font-semibold',
                  transparent ? 'text-white/70' : 'text-muted-foreground'
                )}
              >
                {t('common.beta')}
              </span>
            </span>
          </Link>
        </div>

        <div className="flex-1 max-w-2xl mx-4 hidden md:block">
          {!isSearchOff() && <GlobalSearchBar />}
        </div>

        <div className="flex items-center gap-1 lg:gap-2">
          {isMobile && !isSearchOff() && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchExpanded(true)}
              aria-label={t('common.search', 'Search')}
            >
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
