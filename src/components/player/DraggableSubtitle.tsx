import { useCallback, useEffect, useRef, useState } from 'react'

const POSITION_STORAGE_KEY = 'nostube:subtitle-position'
const DEFAULT_POSITION = { x: 50, y: 88 }

function stripVttTags(text: string): string {
  return text.replace(/<[^>]+>/g, '')
}

interface DraggableSubtitleProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  captionsEnabled: boolean
  selectedSubtitleLang: string
}

export function DraggableSubtitle({
  videoRef,
  containerRef,
  captionsEnabled,
  selectedSubtitleLang,
}: DraggableSubtitleProps) {
  const [cueText, setCueText] = useState('')
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const stored = localStorage.getItem(POSITION_STORAGE_KEY)
      return stored ? (JSON.parse(stored) as { x: number; y: number }) : DEFAULT_POSITION
    } catch {
      return DEFAULT_POSITION
    }
  })

  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{
    clientX: number
    clientY: number
    posX: number
    posY: number
  } | null>(null)

  // Read active cues from the native TextTrack (mode='hidden' loads cues but suppresses native rendering)
  useEffect(() => {
    if (!captionsEnabled || !selectedSubtitleLang) return

    const video = videoRef.current
    if (!video) return

    let track: TextTrack | null = null
    for (let i = 0; i < video.textTracks.length; i++) {
      if (video.textTracks[i].language === selectedSubtitleLang) {
        track = video.textTracks[i]
        break
      }
    }

    if (!track) return

    const handleCueChange = () => {
      const cues = track!.activeCues
      if (cues && cues.length > 0) {
        const lines = Array.from({ length: cues.length }, (_, i) =>
          stripVttTags((cues[i] as VTTCue).text)
        )
        setCueText(lines.join('\n'))
      } else {
        setCueText('')
      }
    }

    track.addEventListener('cuechange', handleCueChange)
    return () => {
      track!.removeEventListener('cuechange', handleCueChange)
      setCueText('')
    }
  }, [captionsEnabled, selectedSubtitleLang, videoRef])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.preventDefault()
      isDraggingRef.current = true
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        posX: position.x,
        posY: position.y,
      }
      ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    },
    [position]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !dragStartRef.current || !containerRef.current) return
      e.stopPropagation()

      const rect = containerRef.current.getBoundingClientRect()
      const dx = ((e.clientX - dragStartRef.current.clientX) / rect.width) * 100
      const dy = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100

      const newX = Math.max(5, Math.min(95, dragStartRef.current.posX + dx))
      const newY = Math.max(5, Math.min(95, dragStartRef.current.posY + dy))

      setPosition({ x: newX, y: newY })
    },
    [containerRef]
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    dragStartRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    setPosition(pos => {
      try {
        localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos))
      } catch {
        // ignore
      }
      return pos
    })
  }, [])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setPosition(DEFAULT_POSITION)
    try {
      localStorage.removeItem(POSITION_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  if (!captionsEnabled || !cueText) return null

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 20,
      }}
    >
      <div
        className="pointer-events-auto select-none px-2 py-0.5 rounded text-white text-center cursor-grab active:cursor-grabbing"
        style={{
          backgroundColor: 'rgba(0,0,0,0.75)',
          fontSize: '1rem',
          lineHeight: 1.5,
          maxWidth: '80vw',
          whiteSpace: 'pre-wrap',
          textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
        }}
        title="Drag to reposition · Double-click to reset"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {cueText}
      </div>
    </div>
  )
}
