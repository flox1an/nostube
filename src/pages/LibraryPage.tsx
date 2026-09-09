import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { History, ListVideo, ThumbsUp, ChevronRight, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useCurrentUser,
  useVideoHistory,
  useLikedEvents,
  useZappedEvents,
  usePlaylists,
  useReadRelays,
} from '@/hooks'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import LoginDialog from '@/components/auth/LoginDialog'
import SignupDialog from '@/components/auth/SignupDialog'

interface LibrarySectionProps {
  icon: React.ElementType
  title: string
  to: string
  count: number
  loading?: boolean
  emptyMessage: string
}

function LibrarySection({
  icon: Icon,
  title,
  to,
  count,
  loading,
  emptyMessage,
}: LibrarySectionProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <span className="font-medium">{title}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="text-sm text-muted-foreground">
        {loading ? '\u2026' : count > 0 ? count : emptyMessage}
      </p>
    </Link>
  )
}

export function LibraryPage() {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [signupDialogOpen, setSignupDialogOpen] = useState(false)

  useEffect(() => {
    document.title = `${t('navigation.library')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  // History is local-only and cheap to read; liked/playlist data reuse the
  // same hooks the standalone History/Playlists/Liked-videos pages already
  // use, so this hub never introduces a second source of truth for any of
  // the three collections.
  const { history } = useVideoHistory()
  const {
    data: likedEventIds = [],
    likedAddresses = [],
    isLoading: likesLoading,
  } = useLikedEvents()
  const {
    data: zappedEventIds = [],
    zappedAddresses = [],
    isLoading: zapsLoading,
  } = useZappedEvents()
  const { playlists, isLoading: playlistsLoading } = usePlaylists()
  const readRelays = useReadRelays()

  const likedCount = useMemo(
    () =>
      new Set([...likedEventIds, ...likedAddresses, ...zappedEventIds, ...zappedAddresses]).size,
    [likedEventIds, likedAddresses, zappedEventIds, zappedAddresses]
  )

  const playlistsPath = user
    ? `${buildProfileUrlFromPubkey(user.pubkey, readRelays)}/playlists`
    : ''

  if (!user) {
    return (
      <div className="max-w-560 mx-auto sm:p-4">
        <div className="rounded-xl border p-8 text-center space-y-3">
          <h1 className="text-xl font-semibold">
            {t('pages.library.signInTitle', { defaultValue: 'Sign in to see your library' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('pages.library.signInDescription', {
              defaultValue:
                'History, playlists and liked videos are saved to your account, not this device.',
            })}
          </p>
          <Button onClick={() => setLoginDialogOpen(true)}>
            <LogIn className="h-4 w-4 mr-2" />
            {t('auth.login.signIn', { defaultValue: 'Sign in' })}
          </Button>
        </div>

        <LoginDialog
          isOpen={loginDialogOpen}
          onClose={() => setLoginDialogOpen(false)}
          onLogin={() => setLoginDialogOpen(false)}
          onSignup={() => {
            setLoginDialogOpen(false)
            setSignupDialogOpen(true)
          }}
        />
        <SignupDialog isOpen={signupDialogOpen} onClose={() => setSignupDialogOpen(false)} />
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <h1 className="text-2xl font-bold px-2 mb-4">{t('navigation.library')}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <LibrarySection
          icon={History}
          title={t('navigation.history')}
          to="/history"
          count={history.length}
          emptyMessage={t('pages.library.historyEmpty', { defaultValue: 'Nothing watched yet' })}
        />
        <LibrarySection
          icon={ListVideo}
          title={t('pages.library.yourPlaylists', { defaultValue: 'Your playlists' })}
          to={playlistsPath}
          count={playlists.length}
          loading={playlistsLoading}
          emptyMessage={t('pages.library.playlistsEmpty', {
            defaultValue: 'No playlists yet — create one from a video',
          })}
        />
        <LibrarySection
          icon={ThumbsUp}
          title={t('navigation.likedVideos')}
          to="/liked-videos"
          count={likedCount}
          loading={likesLoading || zapsLoading}
          emptyMessage={t('pages.library.likedEmpty', { defaultValue: 'No liked videos yet' })}
        />
      </div>
    </div>
  )
}
