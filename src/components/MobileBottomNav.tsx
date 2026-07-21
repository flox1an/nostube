import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useNavigationMenu } from '@/hooks/useNavigationMenu'

export function MobileBottomNav() {
  const { t } = useTranslation()
  const location = useLocation()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const { mobilePrimaryItems, mobileMoreItems } = useNavigationMenu()

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-16 border-t border-border bg-background/95 px-2 pb-safe-area-inset-bottom backdrop-blur-sm lg:hidden">
        {mobilePrimaryItems.map(item => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.id}
              to={item.href}
              className={cn(
                'flex h-full w-full flex-col items-center justify-center gap-1 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5', isActive && !item.noFill && 'fill-current')} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          aria-expanded={isMoreOpen}
          aria-label={t('navigation.more')}
          onClick={() => setIsMoreOpen(true)}
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-1 transition-colors',
            isMoreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t('navigation.more')}</span>
        </button>
      </nav>

      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetContent side="bottom" className="px-4 pb-8 pt-6 lg:hidden">
          <SheetHeader className="mb-4">
            <SheetTitle>{t('navigation.more')}</SheetTitle>
          </SheetHeader>
          <nav className="space-y-1">
            {mobileMoreItems.map(item => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => setIsMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-4 rounded-lg px-3 py-3 transition-colors',
                    isActive ? 'bg-accent' : 'hover:bg-accent'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
