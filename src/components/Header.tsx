import { LoginArea } from '@/components/auth/LoginArea'
import { Button } from '@/components/ui/button'
import { MenuIcon, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useTheme } from '@/providers/theme-provider'
import { getThemeById } from '@/lib/themes'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { GlobalSearchBar } from '@/components/GlobalSearchBar'
import { useTranslation } from 'react-i18next'

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

  // On mobile: hide header when scrolling down (unless at top), show when scrolling up
  const shouldHide = isMobile && scrollDirection === 'down' && !isAtTop

  return (
    <header
      className={`sticky top-0 z-50 transition-transform duration-300 ${transparent ? '' : 'bg-background'} ${
        shouldHide ? '-translate-y-full' : 'translate-y-0'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
    >
      <div className={`w-full px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <MenuIcon />
          </Button>
          <Link to="/" className="text-xl font-bold flex flex-row gap-2 items-center">
            <img className="w-8" src={appTitle.imageUrl} alt="logo" />
            <span className="relative">
              {appTitle.text}
              <span className="absolute -top-1 -right-6 text-[0.5rem] font-semibold text-muted-foreground">
                {t('common.beta')}
              </span>
            </span>
          </Link>
        </div>

        <GlobalSearchBar />

        <div className="flex items-center gap-4">
          {user && (
            <Link to="/upload" className="hidden md:block">
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                {t('header.upload')}
              </Button>
            </Link>
          )}

          <LoginArea />
        </div>
      </div>
    </header>
  )
}
