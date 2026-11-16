import { useImageCascade } from '../hooks/useImageCascade'
import { cn } from '../cn'

/**
 * A NIP-30 custom emoji, inline with the text around it, loaded through the image proxy.
 * Falls back to `:shortcode:` when the image cannot be loaded.
 */
export function CustomEmoji({
  shortcode,
  url,
  className,
}: {
  shortcode: string
  url: string
  className?: string
}) {
  const cascade = useImageCascade({ src: url, variant: 'inline', race: false })
  if (!cascade.src) return <>{`:${shortcode}:`}</>
  return (
    <img
      src={cascade.src}
      alt={`:${shortcode}:`}
      title={`:${shortcode}:`}
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={cascade.onError}
      onLoad={cascade.onLoad}
      // Negative margin: a line with an emote keeps the line height of one without.
      className={cn(
        '-my-[0.25em] inline-block h-[1.75em] w-auto max-w-[5em] object-contain align-middle',
        className
      )}
    />
  )
}
