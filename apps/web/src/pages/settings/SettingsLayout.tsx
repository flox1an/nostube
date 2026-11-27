import { useCallback, useEffect } from 'react'
import { Outlet, useLocation, useNavigate, Navigate, Link } from 'react-router-dom'
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
import { appTitle, pageTitle } from '@nostube/core/instance-config'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@nostube/widgets/components/select'

type SettingsGroupId = 'app' | 'nostr'

interface SettingsCategory {
  id: string
  labelKey: string
  icon: React.ElementType
  description: string
  group: SettingsGroupId
}

const categoryGroups: { id: SettingsGroupId; labelKey: string; defaultLabel: string }[] = [
  { id: 'app', labelKey: 'settings.groups.app', defaultLabel: 'App' },
  { id: 'nostr', labelKey: 'settings.groups.nostr', defaultLabel: 'Nostr & network' },
]

const categories: SettingsCategory[] = [
  {
    id: 'appearance',
    labelKey: 'settings.appearance.title',
    icon: Shirt,
    description: 'settings.appearance.description',
    group: 'app',
  },
  {
    id: 'content',
    labelKey: 'settings.content.title',
    icon: SlidersHorizontal,
    description: 'settings.content.description',
    group: 'app',
  },
  {
    id: 'data',
    labelKey: 'settings.data.title',
    icon: Shield,
    description: 'settings.data.description',
    group: 'app',
  },
  {
    id: 'network',
    labelKey: 'settings.network.title',
    icon: Network,
    description: 'settings.network.description',
    group: 'nostr',
  },
  {
    id: 'storage',
    labelKey: 'settings.storage.title',
    icon: Database,
    description: 'settings.storage.description',
    group: 'nostr',
  },
  {
    id: 'wallet',
    labelKey: 'settings.wallet.title',
    icon: Wallet,
    description: 'settings.wallet.description',
    group: 'nostr',
  },
  {
    id: 'presets',
    labelKey: 'settings.presets.title',
    icon: Palette,
    description: 'settings.presets.description',
    group: 'nostr',
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
      void navigate(`/settings/${categoryId}`)
    },
    [navigate]
  )

  return (
    <>
      {/* Mobile: dropdown select */}
      <div className="md:hidden w-full">
        <Select value={activeCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger
            className="w-full min-h-11"
            aria-label={t('settings.selectSection', { defaultValue: 'Settings section' })}
          >
            <SelectValue placeholder={t('settings.selectSection')} />
          </SelectTrigger>
          <SelectContent>
            {categoryGroups.map((group, groupIndex) => (
              <SelectGroup key={group.id}>
                {groupIndex > 0 && <SelectSeparator />}
                <SelectLabel className="text-xs font-medium text-muted-foreground">
                  {t(group.labelKey, { defaultValue: group.defaultLabel })}
                </SelectLabel>
                {categories
                  .filter(cat => cat.group === group.id)
                  .map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <cat.icon className="h-4 w-4" />
                        <span>{t(cat.labelKey)}</span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: side navigation */}
      <nav
        aria-label={t('settings.title')}
        className="hidden md:flex flex-col gap-4 w-56 shrink-0 sticky top-20 self-start"
      >
        {categoryGroups.map(group => (
          <div key={group.id} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
              {t(group.labelKey, { defaultValue: group.defaultLabel })}
            </p>
            {categories
              .filter(cat => cat.group === group.id)
              .map(cat => {
                const isActive = activeCategory === cat.id
                return (
                  <Link
                    key={cat.id}
                    to={`/settings/${cat.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'justify-start gap-3 h-auto py-2.5 px-3 text-sm font-normal rounded-xl border inline-flex items-center transition-colors',
                      isActive
                        ? 'border-foreground/25 bg-foreground/5 text-foreground font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-foreground/15'
                    )}
                  >
                    <cat.icon className="h-4 w-4 shrink-0" />
                    <div className="text-left leading-tight min-w-0">
                      <span className="block truncate">{t(cat.labelKey)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground font-normal">
                        {t(cat.description)}
                      </span>
                    </div>
                  </Link>
                )
              })}
          </div>
        ))}
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
  // The view-sharing on/off preference moved from Network to Privacy and data;
  // keep the previously supported deep link reaching it.
  const isOldViewTrackingHash = currentPath === 'network' && location.hash === '#view-tracking'

  // Update document title — call BEFORE any early returns per Rules of Hooks
  useEffect(() => {
    if (isIndex) {
      document.title = pageTitle(`${t('settings.title')}`)
    } else if (currentCategory) {
      document.title = pageTitle(`${t(currentCategory.labelKey)}`)
    } else {
      document.title = pageTitle(`${t('settings.title')}`)
    }
    return () => {
      document.title = appTitle()
    }
  }, [t, isIndex, currentCategory])

  // Old URL redirect
  if (redirectTarget) {
    return <Navigate to={`/settings/${redirectTarget}`} replace />
  }
  if (isOldViewTrackingHash) {
    return <Navigate to="/settings/data#view-sharing" replace />
  }

  // Index redirect
  if (isIndex) {
    return <Navigate to="appearance" replace />
  }

  return (
    <div className="container mx-auto py-6 px-4 md:py-8">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        <SettingsSidebar />
        <div className="flex-1 min-w-0 max-w-2xl">
          {currentCategory && <h2 className="sr-only">{t(currentCategory.labelKey)}</h2>}
          <Outlet />
        </div>
      </div>
    </div>
  )
}
