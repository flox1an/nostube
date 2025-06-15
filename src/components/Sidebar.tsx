import {
  Home,
  Play,
  Users,
  History,
  ListVideo,
  ThumbsUp,
  Clock,
  Scissors,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { nip19 } from "nostr-tools";

export function Sidebar() {
  const { user } = useCurrentUser();
  const { config: _config } = useAppContext();

  const navigationItems = [
    { name: "Home", icon: Home, href: "/" },
    { name: "Shorts", icon: Play, href: "/?videoType=shorts" },
    { name: "Subscriptions", icon: Users, href: "/subscriptions" },
  ];

  const libraryItems = [
    { name: "History", icon: History, href: "/history" },
    { name: "Playlists", icon: ListVideo, href: "/playlists" },
    {
      name: "Your videos",
      icon: Play,
      href: `/author/${user?.pubkey ? nip19.npubEncode(user.pubkey) : ""}`,
    },
    { name: "Watch later", icon: Clock, href: "/watch-later" },
    { name: "Liked videos", icon: ThumbsUp, href: "/liked-videos" },
    { name: "Your clips", icon: Scissors, href: "/clips" },
  ];

  return (
    <div className="flex flex-col h-full bg-background border-r">
      <div className="flex flex-col h-full">
        <nav className="px-2">
          {navigationItems.map((item) => (
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
            <h2 className="text-xs font-semibold uppercase text-muted-foreground px-4 mb-2">
              Library
            </h2>
            <nav className="px-2">
              {libraryItems.map((item) => (
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
          </>
        )}
      </div>
    </div>
  );
}
