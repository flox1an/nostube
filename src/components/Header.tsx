import { LoginArea } from "@/components/auth/LoginArea";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MenuIcon, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { SearchBar } from "./SearchBar";
import { useVideoCache } from "@/contexts/VideoCacheContext";
import { useAppContext } from "@/hooks/useAppContext";

export function Header() {
  const { allTags, searchVideos, filterByTags } = useVideoCache();
  const { toggleSidebar,isSidebarOpen } = useAppContext();

  return (
    <header className="border-b sticky top-0 bg-background z-50">
      <div className={`${isSidebarOpen ? 'w-fulL' : 'container'} mx-auto px-4 h-16 flex items-center justify-between`}
      >
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <MenuIcon/>
          </Button>
          <Link to="/" className="text-xl font-bold">
            NostrTube
          </Link>
        </div>

        <SearchBar
          className="flex-1 max-w-2xl"
          allTags={allTags}
          onSearch={searchVideos}
          onTagsChange={filterByTags}
        />

        <div className="flex items-center gap-4">
          <Link to="/upload">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </Link>

          <ThemeToggle />

          <LoginArea className="w-48" />
        </div>
      </div>
    </header>
  );
}
