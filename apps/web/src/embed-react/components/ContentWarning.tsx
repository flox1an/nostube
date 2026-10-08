interface ContentWarningProps {
  title: string
  message: string
  color: string
  /** Only for warning mode; hidden videos never show their thumbnail. */
  poster?: string
  /** Warning mode: reveal the player in place. */
  onAccept?: () => void
  /** Hidden/unverified: send the viewer to nostube, where their own settings apply. */
  watchUrl?: string
}

export function ContentWarning({
  title,
  message,
  color,
  poster,
  onAccept,
  watchUrl,
}: ContentWarningProps) {
  const buttonClass = 'inline-block px-6 py-2 rounded-lg font-medium text-white transition-colors'
  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      {/* Blurred background */}
      {poster && (
        <div
          className="absolute inset-0 bg-cover bg-center blur-xl opacity-30"
          style={{ backgroundImage: `url(${poster})` }}
        />
      )}

      {/* Warning content */}
      <div className="relative z-10 text-center p-6 max-w-sm">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-white text-lg font-semibold mb-2">{title}</h2>
        <p className="text-white/70 text-sm mb-6">{message}</p>
        {onAccept && (
          <button
            onClick={onAccept}
            className={buttonClass}
            style={{ backgroundColor: `#${color}` }}
          >
            Show anyway
          </button>
        )}
        {watchUrl && (
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
            style={{ backgroundColor: `#${color}` }}
          >
            Open on nostube
          </a>
        )}
      </div>
    </div>
  )
}
