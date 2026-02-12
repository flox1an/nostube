import { Header } from '@/components/Header'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MiniSidebar } from './MiniSidebar'
import { MobileBottomNav } from './MobileBottomNav'
import { useAppContext } from '@/hooks/useAppContext'
import { cn } from '@/lib/utils'

export function MainLayout() {
  const { isSidebarOpen, toggleSidebar } = useAppContext()
  const location = useLocation()

  // Hide sidebar and mobile bottom nav on individual video pages to save space
  // Note: /shorts feed page should show sidebar like homepage, only /short/:id hides it
  const isVideoPage =
    location.pathname.startsWith('/v/') ||
    location.pathname.startsWith('/video/') ||
    location.pathname.startsWith('/short/')

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className={cn('flex flex-1 relative w-full lg:mb-0', !isVideoPage && 'mb-16')}>
        {/* Desktop Sidebar - Inline toggle between Mini and Full (hidden on video pages) */}
        {!isVideoPage && (
          <div className="hidden lg:block shrink-0">
            {isSidebarOpen ? <Sidebar mode="inline" /> : <MiniSidebar />}
          </div>
        )}

        {/* Floating Sidebar Drawer - For mobile/tablet (<LG) and all screen sizes on video pages */}
        <div className={cn(isVideoPage ? '' : 'lg:hidden')}>
          {isSidebarOpen && (
            <>
              <div className="fixed inset-0 bg-black/50 z-190" onClick={toggleSidebar} />
              <div className="fixed left-0 top-0 z-200 h-full">
                <Sidebar mode="drawer" />
              </div>
            </>
          )}
        </div>

        <main className="flex-1 bg-background w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        <a
          href="https://github.com/flox1an/nostube"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          made with 💜 and vibes
        </a>
      </footer>
      {!isVideoPage && <MobileBottomNav />}
    </div>
  )
}
