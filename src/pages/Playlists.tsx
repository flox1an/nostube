import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { PlaylistGrid } from '@/components/playlists'
import { usePlaylists, useCurrentUser } from '@/hooks'

export default function PlaylistPage() {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { playlists, isLoading, createPlaylist, deletePlaylist, updatePlaylist } = usePlaylists()

  useEffect(() => {
    document.title = `${t('playlists.myPlaylists')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  if (!user) {
    return (
      <div className="max-w-560 mx-auto sm:p-4 p-2">
        <h1 className="text-2xl font-semibold mb-4">{t('playlists.myPlaylists')}</h1>
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <p className="text-muted-foreground">{t('playlists.loginRequired')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto sm:p-4 p-2">
      <h1 className="text-2xl font-semibold mb-4">{t('playlists.myPlaylists')}</h1>
      <PlaylistGrid
        playlists={playlists}
        userPubkey={user.pubkey}
        isLoading={isLoading}
        onCreatePlaylist={createPlaylist}
        onDeletePlaylist={deletePlaylist}
        onUpdatePlaylist={updatePlaylist}
      />
    </div>
  )
}
