import { Home, Play, Users, History, ListVideo, ThumbsUp, Clock, Scissors, Cog } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const { user } = useCurrentUser();
  const { config: _config } = useAppContext();

  const navigationItems = [
    { name: 'Home', icon: Home, href: '/' },
    { name: 'Shorts', icon: Play, href: '/shorts' },
  ];

  const libraryItems = [
    { name: 'Subscriptions', icon: Users, href: '/subscriptions' },
    { name: 'History', icon: History, href: '/history', disabled: true },
    { name: 'Playlists', icon: ListVideo, href: '/playlists' },
    {
      name: 'Your videos',
      icon: Play,
      href: `/author/${user?.pubkey ? nip19.npubEncode(user.pubkey) : ''}`,
    },
    { name: 'Watch later', icon: Clock, href: '/watch-later', disabled: true },
    { name: 'Liked videos', icon: ThumbsUp, href: '/liked-videos' },
    { name: 'Your clips', icon: Scissors, href: '/clips', disabled: true },
  ];

  const configItems = [{ name: 'Settings', icon: Cog, href: '/settings', disabled: false }];

  return (
    <div className="flex flex-col h-full bg-background pt-4">
      <div className="flex flex-col h-full">
        <nav className="px-2">
          {navigationItems.map(item => (
            <Link
              key={item.name}
              to={item.href}
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
            <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">Library</h2>
            <nav className="px-2">
              {libraryItems.map(item => (
                <Link
                  key={item.name}
                  to={item.disabled ? '#' : item.href}
                  className={cn(
                    'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                    item.disabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'hover:bg-accent'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
            </nav>

            <Separator className="my-4" />
            <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">Configuration</h2>
            <nav className="px-2">
              {configItems.map(item => (
                <Link
                  key={item.name}
                  to={item.disabled ? '#' : item.href}
                  className={cn(
                    'flex items-center gap-4 py-2 px-3 rounded-lg transition-colors',
                    item.disabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'hover:bg-accent'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
