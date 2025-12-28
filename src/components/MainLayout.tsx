import { Header } from '@/components/Header'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAppContext } from '@/hooks/useAppContext'

export function MainLayout() {
  const { isSidebarOpen } = useAppContext()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 relative w-full">
        {/* Floating sidebar */}
        {isSidebarOpen && (
          <div className="fixed left-0 top-0 z-[200] h-full">
            <Sidebar />
          </div>
        )}
        <main className="flex-1 bg-background overflow-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
