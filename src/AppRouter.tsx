import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScrollToTop } from '@/components/ScrollToTop'
import { MainLayout } from '@/components/MainLayout'
import { PageLoader } from '@/components/PageLoader'
import {
  AdminPageLoader,
  AuthorPageLoader,
  GlobalPlaylistsPageLoader,
  HashtagPageLoader,
  HistoryPageLoader,
  LikedVideosPageLoader,
  Mp4DebugPageLoader,
  NotFoundLoader,
  SearchPageLoader,
  ShortsFeedPageLoader,
  ShortsVideoPageLoader,
  SinglePlaylistPageLoader,
  SubscriptionsPageLoader,
  UploadPageLoader,
  VideoNotesPageLoader,
} from '@/components/page-loaders'
import { Skeleton } from '@/components/ui/skeleton'

const SmartHomePage = lazy(() =>
  import('./pages/SmartHomePage').then(m => ({ default: m.SmartHomePage }))
)
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
const PlaylistPage = lazy(() => import('./pages/GlobalPlaylistsPage'))
const SinglePlaylistPage = lazy(() => import('./pages/SinglePlaylistPage'))
const SettingsLayout = lazy(() =>
  import('./pages/settings/SettingsLayout').then(m => ({ default: m.SettingsLayout }))
)
const GeneralSettingsPage = lazy(() =>
  import('./pages/settings/GeneralSettingsPage').then(m => ({ default: m.GeneralSettingsPage }))
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
const CategorySettingsPage = lazy(() =>
  import('./pages/settings/CategorySettingsPage').then(m => ({ default: m.CategorySettingsPage }))
)
const AdminPage = lazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })))
const Mp4DebugPage = lazy(() =>
  import('./pages/Mp4DebugPage').then(m => ({ default: m.Mp4DebugPage }))
)
const NotFound = lazy(() => import('./pages/NotFound'))

function VideoPageLoader() {
  return (
    <div className="max-w-560 mx-auto sm:py-4 pb-8 md:px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_384px] 2xl:grid-cols-[1fr_512px] gap-0 lg:gap-4">
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
              <Skeleton className="w-40 2xl:w-56 aspect-video rounded-lg shrink-0" />
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
                <SmartHomePage />
              </Suspense>
            }
          />
          <Route
            path="/explore"
            element={
              <Suspense fallback={<PageLoader />}>
                <HomePage />
              </Suspense>
            }
          />
          <Route
            path="/shorts"
            element={
              <Suspense fallback={<ShortsFeedPageLoader />}>
                <ShortsPage />
              </Suspense>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <Suspense fallback={<SubscriptionsPageLoader />}>
                <SubscriptionsPage />
              </Suspense>
            }
          />
          <Route
            path="/liked-videos"
            element={
              <Suspense fallback={<LikedVideosPageLoader />}>
                <LikedVideosPage />
              </Suspense>
            }
          />
          <Route
            path="/v/:nevent"
            element={
              <Suspense fallback={<VideoPageLoader />}>
                <VideoPage />
              </Suspense>
            }
          />
          <Route
            path="/v/:nevent"
            element={
              <Suspense fallback={<VideoPageLoader />}>
                <VideoPage />
              </Suspense>
            }
          />
          <Route
            path="/author/:nprofile"
            element={
              <Suspense fallback={<AuthorPageLoader />}>
                <AuthorPage />
              </Suspense>
            }
          />
          <Route
            path="/author/:nprofile/:tab"
            element={
              <Suspense fallback={<AuthorPageLoader />}>
                <AuthorPage />
              </Suspense>
            }
          />
          <Route
            path="/p/:nprofile"
            element={
              <Suspense fallback={<AuthorPageLoader />}>
                <AuthorPage />
              </Suspense>
            }
          />
          <Route
            path="/p/:nprofile/:tab"
            element={
              <Suspense fallback={<AuthorPageLoader />}>
                <AuthorPage />
              </Suspense>
            }
          />
          <Route
            path="/tag/:tag"
            element={
              <Suspense fallback={<HashtagPageLoader />}>
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
              <Suspense fallback={<SearchPageLoader />}>
                <SearchPage />
              </Suspense>
            }
          />
          <Route
            path="/history"
            element={
              <Suspense fallback={<HistoryPageLoader />}>
                <HistoryPage />
              </Suspense>
            }
          />
          <Route
            path="/video-notes"
            element={
              <Suspense fallback={<VideoNotesPageLoader />}>
                <VideoNotesPage />
              </Suspense>
            }
          />
          <Route
            path="/upload"
            element={
              <Suspense fallback={<UploadPageLoader />}>
                <UploadPage />
              </Suspense>
            }
          />
          <Route
            path="/playlists"
            element={
              <Suspense fallback={<GlobalPlaylistsPageLoader />}>
                <PlaylistPage />
              </Suspense>
            }
          />
          <Route
            path="/playlist/:nip19"
            element={
              <Suspense fallback={<SinglePlaylistPageLoader />}>
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
            {/* New category routes: presets has its own component, :category is the generic handler */}
            <Route
              path="presets"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <PresetsSettingsPage />
                </Suspense>
              }
            />
            <Route
              path=":category"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <CategorySettingsPage />
                </Suspense>
              }
            />
            {/* Legacy redirect routes (kept for backward compatibility) */}
            <Route
              path="general"
              element={
                <Suspense fallback={<SettingsContentLoader />}>
                  <GeneralSettingsPage />
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
              <Suspense fallback={<AdminPageLoader />}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route
            path="/mp4-debug"
            element={
              <Suspense fallback={<Mp4DebugPageLoader />}>
                <Mp4DebugPage />
              </Suspense>
            }
          />
        </Route>
        <Route
          path="/short/:nevent"
          element={
            <Suspense fallback={<ShortsVideoPageLoader />}>
              <ShortsVideoPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<NotFoundLoader />}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
