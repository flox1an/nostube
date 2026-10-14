import { Download, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useNavigationMenu } from '@/hooks/useNavigationMenu'
import { useInstallState } from '@nostube/widgets/hooks/useInstallState'
import { getInstallMode, promptInstall } from '@nostube/widgets/install-prompt'
import { IosInstallDialog } from '@nostube/widgets/components/InstallHint'

export function MobileBottomNav() {
  const { t } = useTranslation()
  const location = useLocation()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const { mobilePrimaryItems, mobileMoreItems } = useNavigationMenu()
  const installMode = getInstallMode(useInstallState())
  const [isIosInstallOpen, setIsIosInstallOpen] = useState(false)

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex items-start justify-around border-t border-border bg-background/95 backdrop-blur-sm lg:hidden"
        style={{
          height: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {mobilePrimaryItems.map(item => {
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.id}
              to={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                isActive
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          aria-expanded={isMoreOpen}
          aria-label={t('navigation.more')}
          onClick={() => setIsMoreOpen(true)}
          className={cn(
            'flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-ring',
            isMoreOpen ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-xs font-medium">{t('navigation.more')}</span>
        </button>
      </nav>

      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetContent
          side="bottom"
          className="px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:hidden"
        >
          <SheetHeader className="mb-2 pr-12">
            <SheetTitle className="text-lg">{t('navigation.more')}</SheetTitle>
          </SheetHeader>
          <nav className="space-y-1">
            {mobileMoreItems.map(item => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => setIsMoreOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
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
            {installMode && (
              <button
                type="button"
                onClick={() => {
                  setIsMoreOpen(false)
                  if (installMode === 'prompt') void promptInstall()
                  else setIsIosInstallOpen(true)
                }}
                className="flex w-full items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-accent"
              >
                <Download className="h-5 w-5" />
                <span className="font-medium">{t('install.title')}</span>
              </button>
            )}
          </nav>
        </SheetContent>
      </Sheet>
      <IosInstallDialog open={isIosInstallOpen} onOpenChange={setIsIosInstallOpen} />
    </>
  )
}
