import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { MainLayout } from '@/components/MainLayout'
import { VideoCardSkeleton } from '@/components/VideoCard'
import { cn } from '@/lib/utils'

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
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })))
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage }))
)
const VideoNotesPage = lazy(() =>
  import('./pages/VideoNotesPage').then(m => ({ default: m.VideoNotesPage }))
)
const UploadPage = lazy(() => import('./pages/UploadPage').then(m => ({ default: m.UploadPage })))
const PlaylistPage = lazy(() => import('./pages/Playlists'))
const SinglePlaylistPage = lazy(() => import('./pages/SinglePlaylistPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageLoader() {
  return (
    <div
      className={cn(
        'w-full grid gap-4 sm:px-4 sm:py-4',
        'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
      )}
    >
      {Array.from({ length: 24 }).map((_, i) => (
        <VideoCardSkeleton key={i} format="horizontal" />
      ))}
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
            path="/search"
            element={
              <Suspense fallback={<PageLoader />}>
                <SearchPage />
              </Suspense>
            }
          />
          <Route
            path="/history"
            element={
              <Suspense fallback={<PageLoader />}>
                <HistoryPage />
              </Suspense>
            }
          />
          <Route
            path="/video-notes"
            element={
              <Suspense fallback={<PageLoader />}>
                <VideoNotesPage />
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
