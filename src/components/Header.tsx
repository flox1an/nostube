import { LoginArea } from '@/components/auth/LoginArea'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MenuIcon, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppContext } from '@/hooks/useAppContext'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useIsMobile } from '@/hooks/useIsMobile'

interface HeaderProps {
  transparent?: boolean
}

export function Header({ transparent = false }: HeaderProps) {
  const { toggleSidebar } = useAppContext()
  const { scrollDirection, isAtTop } = useScrollDirection()
  const isMobile = useIsMobile()

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
            <img className="w-8" src="/nostube.svg"></img>
            nostube
          </Link>
        </div>
        {/*
        <SearchBar
          className="flex-1 max-w-2xl px-4"
          allTags={allTags}
          onSearch={searchVideos}
          onTagsChange={filterByTags}
        />
*/}
        <div className="flex items-center gap-4">
          <Link to="/upload" className="hidden md:block">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </Link>

          <ThemeToggle />

          <LoginArea className="lg:w-48" />
        </div>
      </div>
    </header>
  )
}
