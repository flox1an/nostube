import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { useVideoCache } from '@/hooks/useVideoCache';

export function Header() {
  const { allTags, searchVideos, filterByTags } = useVideoCache();

  return (
    <header className="border-b sticky top-0 bg-background z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold">
          NostrTube
        </Link>

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
  )
}