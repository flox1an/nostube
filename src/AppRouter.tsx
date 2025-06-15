import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { HomePage } from '@/pages/HomePage';
import { VideoPage } from '@/pages/VideoPage';
import { AuthorPage } from '@/pages/AuthorPage';
import { UploadPage } from '@/pages/UploadPage';
import NotFound from '@/pages/NotFound';
import PlaylistPage from '@/pages/Playlists';
import { SubscriptionsPage } from '@/pages/SubscriptionsPage';

const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        path: '/subscriptions',
        element: <SubscriptionsPage />,
      },
      {
        path: '/video/:nevent',
        element: <VideoPage />,
      },
      {
        path: '/author/:npub',
        element: <AuthorPage />,
      },
      {
        path: '/upload',
        element: <UploadPage />,
      },
      {
        path: '/playlists',
        element: <PlaylistPage />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}