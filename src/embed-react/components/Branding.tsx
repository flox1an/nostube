interface BrandingProps {
  visible: boolean
  color: string
  videoId: string
}

export function Branding({ visible, color, videoId }: BrandingProps) {
  const watchUrl = `https://nostube.com/watch?v=${videoId}`

  return (
    <a
      href={watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`absolute bottom-12 right-3 px-2 py-1 rounded text-xs font-medium transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        background: `linear-gradient(135deg, #${color}, #${color}dd)`,
        color: 'white',
      }}
    >
      nostube
    </a>
  )
}
