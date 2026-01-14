import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { MainLayout } from '@/components/MainLayout'
import { VideoCardSkeleton } from '@/components/VideoCard'
import { Skeleton } from '@/components/ui/skeleton'
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
const CategoryPage = lazy(() =>
  import('./pages/CategoryPage').then(m => ({ default: m.CategoryPage }))
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
const SettingsLayout = lazy(() =>
  import('./pages/settings/SettingsLayout').then(m => ({ default: m.SettingsLayout }))
)
const GeneralSettingsPage = lazy(() =>
  import('./pages/settings/GeneralSettingsPage').then(m => ({ default: m.GeneralSettingsPage }))
)
const WalletSettingsPage = lazy(() =>
  import('./pages/settings/WalletSettingsPage').then(m => ({ default: m.WalletSettingsPage }))
)
const RelaysSettingsPage = lazy(() =>
  import('./pages/settings/RelaysSettingsPage').then(m => ({ default: m.RelaysSettingsPage }))
)
const BlossomSettingsPage = lazy(() =>
  import('./pages/settings/BlossomSettingsPage').then(m => ({ default: m.BlossomSettingsPage }))
)
const CachingSettingsPage = lazy(() =>
  import('./pages/settings/CachingSettingsPage').then(m => ({ default: m.CachingSettingsPage }))
)
const CacheSettingsPage = lazy(() =>
  import('./pages/settings/CacheSettingsPage').then(m => ({ default: m.CacheSettingsPage }))
)
const MissingVideosSettingsPage = lazy(() =>
  import('./pages/settings/MissingVideosSettingsPage').then(m => ({
    default: m.MissingVideosSettingsPage,
  }))
)
const PresetsSettingsPage = lazy(() =>
  import('./pages/settings/PresetsSettingsPage').then(m => ({
    default: m.PresetsSettingsPage,
  }))
)
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageLoader() {
  return (
    <div className="max-w-560 mx-auto">
      <div className="sm:px-2">
        <div
          className={cn(
            'grid',
            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
          )}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <VideoCardSkeleton key={i} format="horizontal" />
          ))}
        </div>
      </div>
    </div>
  )
}

function VideoPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:py-4 pb-8 md:px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_384px] gap-0 lg:gap-4">
        {/* Left column: video + info */}
        <div className="flex flex-col">
          <Skeleton className="w-full aspect-video" />
          <div className="p-2 md:p-0 mt-3 space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-5 w-32" />
            </div>
          </div>
        </div>
        {/* Right column: sidebar */}
        <div className="w-full p-2 md:p-0 space-y-3 mt-4 lg:mt-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="w-40 aspect-video rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingsMenuLoader() {
  return (
    <div className="container mx-auto py-8 max-w-2xl px-4">
      <Skeleton className="h-9 w-32 mb-6" />
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function SettingsContentLoader() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
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
              <Suspense fallback={<VideoPageLoader />}>
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
            path="/category/:category"
            element={
              <Suspense fallback={<PageLoader />}>
                <CategoryPage />
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
              <Suspense fallback={<SettingsMenuLoader />}>
                <SettingsLayout />
              </Suspense>
            }
          >
            <Route
              path="general"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <GeneralSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="presets"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <PresetsSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="wallet"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <WalletSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="relays"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <RelaysSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="blossom"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <BlossomSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="caching"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <CachingSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="cache"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <CacheSettingsPage />
                </Suspense>
              }
            />
            <Route
              path="missing-videos"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <MissingVideosSettingsPage />
                </Suspense>
              }
            />
          </Route>
          <Route
            path="/admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <AdminPage />
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
