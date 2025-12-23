interface ContentWarningProps {
  reason: string
  onAccept: () => void
  color: string
  poster?: string
}

export function ContentWarning({ reason, onAccept, color, poster }: ContentWarningProps) {
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
        <h2 className="text-white text-lg font-semibold mb-2">Content Warning</h2>
        <p className="text-white/70 text-sm mb-6">
          {reason || 'This video may contain sensitive content.'}
        </p>
        <button
          onClick={onAccept}
          className="px-6 py-2 rounded-lg font-medium text-white transition-colors"
          style={{ backgroundColor: `#${color}` }}
        >
          Show anyway
        </button>
      </div>
    </div>
  )
}
