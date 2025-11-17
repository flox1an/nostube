import { Home, Play, Users, History, ListVideo, ThumbsUp, Clock, Cog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser, useAppContext, useReadRelays } from '@/hooks'
import { nip19 } from 'nostr-tools'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

export function Sidebar() {
  const { user } = useCurrentUser()
  const { config: _config, toggleSidebar } = useAppContext()
  const readRelays = useReadRelays()
  const pubkey = user?.pubkey

  const userNprofile = useMemo(() => {
    if (!pubkey) return ''
    return nip19.nprofileEncode({ pubkey, relays: readRelays.slice(0, 5) })
  }, [pubkey, readRelays])

  const navigationItems = [
    { name: 'Home', icon: Home, href: '/' },
    { name: 'Shorts', icon: Play, href: '/shorts' },
  ]

  const libraryItems = [
    { name: 'Subscriptions', icon: Users, href: '/subscriptions' },
    { name: 'History', icon: History, href: '/history', disabled: false },
    { name: 'Playlists', icon: ListVideo, href: '/playlists' },
    {
      name: 'Your videos',
      icon: Play,
      href: `/author/${userNprofile}`,
    },
    { name: 'Watch later', icon: Clock, href: '/watch-later', disabled: true },
    { name: 'Liked videos', icon: ThumbsUp, href: '/liked-videos' },
  ]

  const configItems = [{ name: 'Settings', icon: Cog, href: '/settings', disabled: false }]

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
              Library
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
          Configuration
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
