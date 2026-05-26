import { useCallback, useEffect } from 'react'
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Palette,
  Shirt,
  SlidersHorizontal,
  Network,
  Database,
  Shield,
  Wallet,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SettingsCategory {
  id: string
  labelKey: string
  icon: React.ElementType
  description: string
}

const categories: SettingsCategory[] = [
  {
    id: 'appearance',
    labelKey: 'settings.appearance.title',
    icon: Shirt,
    description: 'settings.appearance.description',
  },
  {
    id: 'content',
    labelKey: 'settings.content.title',
    icon: SlidersHorizontal,
    description: 'settings.content.description',
  },
  {
    id: 'presets',
    labelKey: 'settings.presets.title',
    icon: Palette,
    description: 'settings.presets.description',
  },
  {
    id: 'network',
    labelKey: 'settings.network.title',
    icon: Network,
    description: 'settings.network.description',
  },
  {
    id: 'storage',
    labelKey: 'settings.storage.title',
    icon: Database,
    description: 'settings.storage.description',
  },
  {
    id: 'wallet',
    labelKey: 'settings.wallet.title',
    icon: Wallet,
    description: 'settings.wallet.description',
  },
  {
    id: 'data',
    labelKey: 'settings.data.title',
    icon: Shield,
    description: 'settings.data.description',
  },
]

// Maps old URL paths to new category paths for redirects
const oldPathToNew: Record<string, string> = {
  general: 'appearance',
  relays: 'network#relays',
  blossom: 'network#blossom',
  caching: 'network#caching',
  cache: 'storage',
  'missing-videos': 'storage',
}

function SettingsSidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const currentPath = normalizedPath.split('/').pop() || 'appearance'
  const activeCategory = currentPath === 'settings' ? 'appearance' : currentPath

  const handleCategoryChange = useCallback(
    (categoryId: string) => {
      navigate(`/settings/${categoryId}`)
    },
    [navigate]
  )

  return (
    <>
      {/* Mobile: dropdown select */}
      <div className="md:hidden w-full mb-6">
        <Select value={activeCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('settings.selectSection')} />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>
                <div className="flex items-center gap-2">
                  <cat.icon className="h-4 w-4" />
                  <span>{t(cat.labelKey)}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: side navigation */}
      <nav className="hidden md:flex flex-col gap-1 w-56 shrink-0 sticky top-20 self-start">
        {categories.map(cat => {
          const isActive = activeCategory === cat.id
          return (
            <Button
              key={cat.id}
              variant="ghost"
              className={cn(
                'justify-start gap-3 h-auto py-2.5 px-3 text-sm font-normal rounded-lg',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
              onClick={() => navigate(`/settings/${cat.id}`)}
            >
              <cat.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : '')} />
              <div className="text-left leading-tight min-w-0">
                <span className="block truncate">{t(cat.labelKey)}</span>
                <span className="block truncate text-[11px] text-muted-foreground font-normal">
                  {t(cat.description)}
                </span>
              </div>
            </Button>
          )
        })}
      </nav>
    </>
  )
}

export function SettingsLayout() {
  const { t } = useTranslation()
  const location = useLocation()

  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/'
  const isIndex = normalizedPath === '/settings'
  const currentPath = normalizedPath.split('/').pop() || ''
  const activeCategory = isIndex ? 'appearance' : currentPath
  const currentCategory = categories.find(c => c.id === activeCategory)
  const needsOldRedirect = oldPathToNew[currentPath] && currentPath !== oldPathToNew[currentPath]
  const redirectTarget = needsOldRedirect ? oldPathToNew[currentPath] : null

  // Update document title — call BEFORE any early returns per Rules of Hooks
  useEffect(() => {
    if (isIndex) {
      document.title = `${t('settings.title')} - nostube`
    } else if (currentCategory) {
      document.title = `${t(currentCategory.labelKey)} - nostube`
    } else {
      document.title = `${t('settings.title')} - nostube`
    }
    return () => {
      document.title = 'nostube'
    }
  }, [t, isIndex, currentCategory])

  // Old URL redirect
  if (redirectTarget) {
    return <Navigate to={`/settings/${redirectTarget}`} replace />
  }

  // Index redirect
  if (isIndex) {
    return <Navigate to="appearance" replace />
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <SettingsSidebar />
        <main className="flex-1 min-w-0 max-w-2xl">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
