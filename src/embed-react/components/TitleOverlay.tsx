import { nip19 } from 'nostr-tools'
import type { Profile } from '../lib/profile-fetcher'

interface TitleOverlayProps {
  title: string
  author: Profile | null
  authorPubkey: string
  visible: boolean
  videoId: string
  onOpenVideo?: () => void
}

export function TitleOverlay({
  title,
  author,
  authorPubkey,
  visible,
  videoId,
  onOpenVideo,
}: TitleOverlayProps) {
  const displayName = author?.displayName || author?.name || authorPubkey.slice(0, 8) + '...'
  const watchUrl = `https://nostu.be/video/${videoId}`
  const nprofile = nip19.nprofileEncode({ pubkey: authorPubkey })
  const profileUrl = `https://nostu.be/author/${nprofile}`

  const handleClick = () => {
    onOpenVideo?.()
  }

  return (
    <div
      className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Title */}
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="text-white font-medium text-base hover:underline line-clamp-2 block mb-1"
      >
        {title}
      </a>

      {/* Author row */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {author?.picture && (
          <img
            src={author.picture}
            alt={displayName}
            className="w-6 h-6 rounded-full object-cover"
          />
        )}
        <span className="text-white/80 text-sm">{displayName}</span>
      </a>
    </div>
  )
}
