import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { MainLayout } from '@/components/MainLayout'
import { Skeleton } from '@/components/ui/skeleton'

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const ShortsPage = lazy(() => import('./pages/ShortsPage').then(m => ({ default: m.ShortsPage })))
const ShortsVideoPage = lazy(() =>
  import('./pages/ShortsVideoPage').then(m => ({ default: m.ShortsVideoPage }))
)
const SubscriptionsPage = lazy(() =>
  import('./pages/SubscriptionsPage').then(m => ({ default: m.SubscriptionsPage }))
)
const LikedVideosPage = lazy(() =>
  import('./pages/LikedVideosPage').then(m => ({ default: m.LikedVideosPage }))
)
const VideoPage = lazy(() => import('./pages/VideoPage').then(m => ({ default: m.VideoPage })))
const AuthorPage = lazy(() => import('./pages/AuthorPage').then(m => ({ default: m.AuthorPage })))
const HashtagPage = lazy(() =>
  import('./pages/HashtagPage').then(m => ({ default: m.HashtagPage }))
)
const UploadPage = lazy(() => import('./pages/UploadPage').then(m => ({ default: m.UploadPage })))
const PlaylistPage = lazy(() => import('./pages/Playlists'))
const SinglePlaylistPage = lazy(() => import('./pages/SinglePlaylistPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageLoader() {
  return (
    <div className="container py-12 space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoader />}>
                <HomePage />
              </Suspense>
            }
          />
          <Route
            path="/shorts"
            element={
              <Suspense fallback={<PageLoader />}>
                <ShortsPage />
              </Suspense>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <Suspense fallback={<PageLoader />}>
                <SubscriptionsPage />
              </Suspense>
            }
          />
          <Route
            path="/liked-videos"
            element={
              <Suspense fallback={<PageLoader />}>
                <LikedVideosPage />
              </Suspense>
            }
          />
          <Route
            path="/video/:nevent"
            element={
              <Suspense fallback={<PageLoader />}>
                <VideoPage />
              </Suspense>
            }
          />
          <Route
            path="/author/:nprofile"
            element={
              <Suspense fallback={<PageLoader />}>
                <AuthorPage />
              </Suspense>
            }
          />
          <Route
            path="/tag/:tag"
            element={
              <Suspense fallback={<PageLoader />}>
                <HashtagPage />
              </Suspense>
            }
          />
          <Route
            path="/upload"
            element={
              <Suspense fallback={<PageLoader />}>
                <UploadPage />
              </Suspense>
            }
          />
          <Route
            path="/playlists"
            element={
              <Suspense fallback={<PageLoader />}>
                <PlaylistPage />
              </Suspense>
            }
          />
          <Route
            path="/playlist/:nip19"
            element={
              <Suspense fallback={<PageLoader />}>
                <SinglePlaylistPage />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
        <Route
          path="/short/:nevent"
          element={
            <Suspense fallback={<PageLoader />}>
              <ShortsVideoPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<PageLoader />}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
