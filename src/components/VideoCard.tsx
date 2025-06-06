import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { Card, CardContent } from '@/components/ui/card';
import { formatDistance } from 'date-fns';

interface VideoCardProps {
  video: {
    id: string;
    identifier: string;
    title: string;
    thumb: string;
    pubkey: string;
    created_at: number;
    duration: number;
    tags: string[];
  };
  hideAuthor?: boolean;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function VideoCard({ video, hideAuthor }: VideoCardProps) {
  const author = useAuthor(video.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || video?.pubkey.slice(0, 8);

  return (
    <Card className="hover:bg-accent transition-colors">
      <CardContent className="p-0">
        <Link to={`/video/${video.identifier}`}>
          <div className="relative">
            <img 
              loading="lazy"
              src={video.thumb} 
              alt={video.title}
              className="w-full aspect-video object-cover"
            />
            <div className="absolute bottom-2 right-2 bg-black/80 text-white px-1 rounded text-sm">
              {formatDuration(video.duration)}
            </div>
          </div>
        </Link>
        <div className="p-4">
          <Link to={`/video/${video.identifier}`}>
            <h3 className="font-medium line-clamp-2">{video.title}</h3>
          </Link>
          
          {!hideAuthor && (
            <Link 
              to={`/author/${video.pubkey}`}
              className="block text-sm text-muted-foreground mt-2 hover:text-primary"
            >
              {name}
            </Link>
          )}
          
          <div className="text-xs text-muted-foreground">
            {formatDistance(new Date(video.created_at * 1000), new Date(), { addSuffix: true })}
          </div>
          
        </div>
      </CardContent>
    </Card>
  );
}