import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import NotFound from '@/pages/NotFound';
import { ScrollToTop } from '@/components/ScrollToTop';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { LikedVideosPage } from './pages/LikedVideosPage';
import { MainLayout } from '@/components/MainLayout';
import { VideoPage } from '@/pages/VideoPage';
import { AuthorPage } from '@/pages/AuthorPage';
import { UploadPage } from '@/pages/UploadPage';
import PlaylistPage from '@/pages/Playlists';

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/liked-videos" element={<LikedVideosPage />} />
          <Route path="/video/:nevent" element={<VideoPage />} />
          <Route path="/author/:npub" element={<AuthorPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/playlists" element={<PlaylistPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}