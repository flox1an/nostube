import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { HomePage } from '@/pages/HomePage';
import { VideoPage } from '@/pages/VideoPage';
import { AuthorPage } from '@/pages/AuthorPage';
import { UploadPage } from '@/pages/UploadPage';
import NotFound from '@/pages/NotFound';

const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        path: '/video/:id',
        element: <VideoPage />,
      },
      {
        path: '/author/:pubkey',
        element: <AuthorPage />,
      },
      {
        path: '/upload',
        element: <UploadPage />,
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