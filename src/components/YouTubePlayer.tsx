interface YouTubePlayerProps {
  videoId: string
  className?: string
}

export function YouTubePlayer({ videoId, className }: YouTubePlayerProps) {
  return (
    <div className={`relative bg-black overflow-hidden ${className || ''}`}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        title="YouTube video player"
      />
    </div>
  )
}
