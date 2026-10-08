import { useTranslation } from 'react-i18next'

interface YouTubePlayerProps {
  videoId: string
  className?: string
}

export function YouTubePlayer({ videoId, className }: YouTubePlayerProps) {
  const { i18n } = useTranslation()
  const lang = i18n.language?.split('-')[0] || 'en'

  const params = new URLSearchParams({
    rel: '0',
    mute: '0',
    controls: '1',
    fs: '1',
    hl: lang,
    modestbranding: '1',
  })

  return (
    <div className={`relative bg-black overflow-hidden ${className || ''}`}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?${params}`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        title="YouTube video player"
      />
    </div>
  )
}
