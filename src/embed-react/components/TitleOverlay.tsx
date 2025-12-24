import type { Profile } from '../lib/profile-fetcher'

interface TitleOverlayProps {
  title: string
  author: Profile | null
  authorPubkey: string
  visible: boolean
  videoId: string
}

export function TitleOverlay({ title, author, authorPubkey, visible, videoId }: TitleOverlayProps) {
  const displayName = author?.displayName || author?.name || authorPubkey.slice(0, 8) + '...'
  const watchUrl = `https://nostu.be/video/${videoId}`

  return (
    <div
      className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Author row */}
      <div className="flex items-center gap-2 mb-1">
        {author?.picture && (
          <img
            src={author.picture}
            alt={displayName}
            className="w-6 h-6 rounded-full object-cover"
          />
        )}
        <span className="text-white/80 text-sm">{displayName}</span>
      </div>

      {/* Title */}
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-white font-medium text-base hover:underline line-clamp-2"
      >
        {title}
      </a>
    </div>
  )
}
