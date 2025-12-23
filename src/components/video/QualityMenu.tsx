import { useRef, useState, useEffect, useCallback } from 'react'
import { type VideoVariant } from '@/utils/video-event'

interface QualityMenuProps {
  variants: VideoVariant[]
  selectedIndex: number
  onSelectQuality: (index: number) => void
}

/**
 * Quality selector menu for video player.
 * Displays available video qualities and allows switching between them.
 */
export function QualityMenu({ variants, selectedIndex, onSelectQuality }: QualityMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close menu on escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleSelect = useCallback(
    (index: number) => {
      onSelectQuality(index)
      setIsOpen(false)
    },
    [onSelectQuality]
  )

  const selectedVariant = variants[selectedIndex]
  const currentQualityLabel = selectedVariant?.quality || 'Auto'

  // Don't render if only one variant
  if (variants.length <= 1) {
    return null
  }

  return (
    <button
      ref={buttonRef}
      className="media-button"
      aria-label={`Quality: ${currentQualityLabel}`}
      aria-haspopup="true"
      aria-expanded={isOpen}
      onClick={() => setIsOpen(!isOpen)}
      title="Video quality"
      style={{ position: 'relative' }}
    >
      {/* Quality icon (grid/layers) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Video quality options"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: '8px',
            background: 'rgba(28, 28, 28, 0.95)',
            borderRadius: '8px',
            minWidth: '120px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
            zIndex: 100,
            backdropFilter: 'blur(8px)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div
            style={{
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.7)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Quality
          </div>
          {variants.map((variant, index) => (
            <div
              key={variant.url}
              role="menuitemradio"
              aria-checked={index === selectedIndex}
              tabIndex={0}
              onClick={() => handleSelect(index)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelect(index)
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 14px',
                background: index === selectedIndex ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                color: 'white',
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              onMouseOut={e =>
                (e.currentTarget.style.background =
                  index === selectedIndex ? 'rgba(255, 255, 255, 0.15)' : 'transparent')
              }
            >
              <span style={{ flex: 1, fontWeight: 500 }}>
                {variant.quality || `Quality ${index + 1}`}
              </span>
              {index === selectedIndex && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </button>
  )
}
