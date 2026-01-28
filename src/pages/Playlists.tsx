import { useEffect } from 'react'
import { PlaylistManager } from '@/components/PlaylistManager'
import { useTranslation } from 'react-i18next'

export default function PlaylistPage() {
  const { t } = useTranslation()

  useEffect(() => {
    document.title = `${t('playlists.myPlaylists')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  return (
    <div className="container py-8 max-w-4xl mx-auto p-2 sm:p-4">
      <h1 className="text-3xl font-bold mb-6">{t('playlists.myPlaylists')}</h1>
      <PlaylistManager />
    </div>
  )
}
