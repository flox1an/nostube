import {
  Home,
  Play,
  Users,
  History,
  ListVideo,
  ThumbsUp,
  Clock,
  Cog,
  FileText,
  MenuIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser, useAppContext, useReadRelays, useIsMobile } from '@/hooks'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/providers/theme-provider'
import { getThemeById } from '@/lib/themes'
import { nip19 } from 'nostr-tools'
import { cn } from '@/lib/utils'
import { isBetaUser } from '@/lib/beta-users'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export function Sidebar({ mode = 'auto' }: { mode?: 'drawer' | 'inline' | 'auto' }) {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { toggleSidebar } = useAppContext()
  const { colorTheme } = useTheme()
  const currentTheme = getThemeById(colorTheme)
  const appTitle = currentTheme.appTitle || { text: 'nostube', imageUrl: '/nostube.svg' }
  const isMobile = useIsMobile()
  const isDrawer = mode === 'drawer' || (mode === 'auto' && isMobile)
  const readRelays = useReadRelays()
  const pubkey = user?.pubkey

  const userNprofile = useMemo(() => {
    if (!pubkey) return ''
    return nip19.nprofileEncode({ pubkey, relays: readRelays.slice(0, 5) })
  }, [pubkey, readRelays])

  // Beta feature: only show video-notes for beta users
  const isVideoNotesBetaUser = isBetaUser(pubkey)

  const navigationItems = [
    { name: t('navigation.home'), icon: Home, href: '/' },
    { name: t('navigation.shorts'), icon: Play, href: '/shorts' },
  ]

  const libraryItems = [
    { name: t('navigation.subscriptions'), icon: Users, href: '/subscriptions' },
    { name: t('navigation.history'), icon: History, href: '/history', disabled: false },
    { name: t('navigation.playlists'), icon: ListVideo, href: '/playlists' },
    {
      name: t('navigation.yourVideos'),
      icon: Play,
      href: `/author/${userNprofile}`,
    },
    // Only show video-notes for beta users
    ...(isVideoNotesBetaUser
      ? [
          {
            name: t('navigation.videoNotes'),
            icon: FileText,
            href: '/video-notes',
            disabled: false,
          },
        ]
      : []),
    { name: t('navigation.watchLater'), icon: Clock, href: '/watch-later', disabled: true },
    { name: t('navigation.likedVideos'), icon: ThumbsUp, href: '/liked-videos' },
  ]

  const configItems = [
    { name: t('navigation.settings'), icon: Cog, href: '/settings', disabled: false },
  ]

  const handleItemClick = (disabled?: boolean) => {
    if (disabled) return
    if (isDrawer) {
      toggleSidebar()
    }
  }

  return (
    <aside
      className={cn(
        'flex flex-col w-56 bg-background transition-all duration-300 overflow-y-auto',
        isDrawer
          ? 'h-full shadow-lg backdrop-blur-sm bg-background/95'
          : 'sticky top-14 h-[calc(100vh-3.5rem)]'
      )}
      style={{
        paddingTop: isDrawer ? 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' : '1rem',
      }}
    >
      <div className="flex flex-col h-full">
        {isDrawer && (
          <div className="flex items-center gap-2 px-4 h-14 shrink-0">
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              <MenuIcon />
            </Button>
            <Link
              to="/"
              onClick={toggleSidebar}
              className="text-xl font-bold flex flex-row gap-2 items-center"
            >
              <img className="w-8" src={appTitle.imageUrl} alt="logo" />
              <span className="relative">
                {appTitle.text}
                <span className="absolute -top-1 -right-6 text-[0.5rem] font-semibold text-muted-foreground">
                  {t('common.beta')}
                </span>
              </span>
            </Link>
          </div>
        )}
        <nav className="px-2">
          {navigationItems.map(item => (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => handleItemClick()}
              className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-accent transition-colors"
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

        {user && (
          <>
            <Separator className="my-4" />
            <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">
              {t('navigation.library')}
            </h2>
            <nav className="px-2">
              {libraryItems.map(item => (
                <Link
                  key={item.name}
                  to={item.disabled ? '#' : item.href}
                  onClick={() => handleItemClick(item.disabled)}
                  className={cn(
                    'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                    item.disabled
                      ? 'pointer-events-none opacity-50 cursor-not-allowed'
                      : 'hover:bg-accent'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
            </nav>
          </>
        )}

        <Separator className="my-4" />
        <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">
          {t('navigation.configuration')}
        </h2>
        <nav className="px-2">
          {configItems.map(item => (
            <Link
              key={item.name}
              to={item.disabled ? '#' : item.href}
              onClick={() => handleItemClick(item.disabled)}
              className={cn(
                'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                item.disabled
                  ? 'pointer-events-none opacity-50 cursor-not-allowed'
                  : 'hover:bg-accent'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  )
}
