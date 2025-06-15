import { PlaylistManager } from '@/components/PlaylistManager';

export default function PlaylistPage() {
  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Playlists</h1>
      <PlaylistManager />
    </div>
  );
}