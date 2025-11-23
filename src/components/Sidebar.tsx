import { Home, Play, Users, History, ListVideo, ThumbsUp, Clock, Cog, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser, useAppContext, useReadRelays } from '@/hooks'
import { nip19 } from 'nostr-tools'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export function Sidebar() {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { config: _config, toggleSidebar } = useAppContext()
  const readRelays = useReadRelays()
  const pubkey = user?.pubkey

  const userNprofile = useMemo(() => {
    if (!pubkey) return ''
    return nip19.nprofileEncode({ pubkey, relays: readRelays.slice(0, 5) })
  }, [pubkey, readRelays])

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
    { name: t('navigation.videoNotes'), icon: FileText, href: '/video-notes', disabled: false },
    { name: t('navigation.watchLater'), icon: Clock, href: '/watch-later', disabled: true },
    { name: t('navigation.likedVideos'), icon: ThumbsUp, href: '/liked-videos' },
  ]

  const configItems = [
    { name: t('navigation.settings'), icon: Cog, href: '/settings', disabled: false },
  ]

  return (
    <div className="flex flex-col h-full w-56 bg-background/95 backdrop-blur-sm border-r border-border shadow-lg pt-4">
      <div className="flex flex-col h-full">
        <nav className="px-2">
          {navigationItems.map(item => (
            <Link
              key={item.name}
              to={item.href}
              onClick={toggleSidebar}
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
                  onClick={item.disabled ? undefined : toggleSidebar}
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
              onClick={item.disabled ? undefined : toggleSidebar}
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
    </div>
  )
}
