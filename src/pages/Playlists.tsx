import { PlaylistManager } from '@/components/PlaylistManager'
import { useTranslation } from 'react-i18next'

export default function PlaylistPage() {
  const { t } = useTranslation()

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t('playlists.myPlaylists')}</h1>
      <PlaylistManager />
    </div>
  )
}
