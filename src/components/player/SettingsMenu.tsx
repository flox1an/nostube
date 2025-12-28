import { useState, useRef, useEffect, memo } from 'react'
import { Settings, ChevronRight, ChevronLeft, Check } from 'lucide-react'
import { type HlsQualityLevel } from './hooks/useHls'
import { type VideoVariant, type TextTrack } from '@/utils/video-event'
import { getLanguageLabel } from '@/lib/utils'

type MenuView = 'main' | 'quality' | 'speed' | 'subtitles'

interface QualityOption {
  label: string
  value: number // -1 for auto (HLS), or variant index
}

interface SettingsMenuProps {
  // HLS quality (for HLS streams)
  hlsLevels?: HlsQualityLevel[]
  hlsCurrentLevel?: number
  onHlsLevelChange?: (level: number) => void

  // Native video quality (for non-HLS)
  videoVariants?: VideoVariant[]
  selectedVariantIndex?: number
  onVariantChange?: (index: number) => void

  // Playback speed
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void

  // Subtitles
  textTracks?: TextTrack[]
  selectedSubtitleLang?: string // empty string = off
  onSubtitleChange?: (lang: string) => void

  // Is HLS mode
  isHls: boolean
}

const PLAYBACK_SPEEDS = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: 'Normal', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '1.75x', value: 1.75 },
  { label: '2x', value: 2 },
]

/**
 * Settings menu with nested submenus for quality and playback speed
 */
export const SettingsMenu = memo(function SettingsMenu({
  hlsLevels = [],
  hlsCurrentLevel = -1,
  onHlsLevelChange,
  videoVariants = [],
  selectedVariantIndex = 0,
  onVariantChange,
  playbackRate,
  onPlaybackRateChange,
  textTracks = [],
  selectedSubtitleLang = '',
  onSubtitleChange,
  isHls,
}: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentView, setCurrentView] = useState<MenuView>('main')
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Build quality options based on mode
  const qualityOptions: QualityOption[] = isHls
    ? [
        { label: 'Auto', value: -1 },
        ...hlsLevels.map(level => ({ label: level.label, value: level.index })),
      ]
    : videoVariants.map((variant, index) => ({
        label: variant.quality || `Quality ${index + 1}`,
        value: index,
      }))

  const currentQuality = isHls ? hlsCurrentLevel : selectedVariantIndex
  const currentQualityLabel =
    currentQuality === -1
      ? 'Auto'
      : qualityOptions.find(q => q.value === currentQuality)?.label || 'Unknown'

  const currentSpeedLabel =
    PLAYBACK_SPEEDS.find(s => s.value === playbackRate)?.label || `${playbackRate}x`

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setCurrentView('main')
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
        if (currentView !== 'main') {
          setCurrentView('main')
        } else {
          setIsOpen(false)
        }
        e.preventDefault()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentView])

  const handleToggle = () => {
    setIsOpen(prev => {
      if (prev) {
        setCurrentView('main')
      }
      return !prev
    })
  }

  const handleQualitySelect = (value: number) => {
    if (isHls) {
      onHlsLevelChange?.(value)
    } else {
      onVariantChange?.(value)
    }
    setIsOpen(false)
    setCurrentView('main')
  }

  const handleSpeedSelect = (value: number) => {
    onPlaybackRateChange(value)
    setIsOpen(false)
    setCurrentView('main')
  }

  const handleSubtitleSelect = (lang: string) => {
    onSubtitleChange?.(lang)
    setIsOpen(false)
    setCurrentView('main')
  }

  // Don't show menu if no quality options (single quality, no HLS)
  const hasQualityOptions = qualityOptions.length > 1 || isHls
  const hasSubtitles = textTracks.length > 0

  // Build subtitle label
  const currentSubtitleLabel = selectedSubtitleLang ? getLanguageLabel(selectedSubtitleLang) : 'Off'

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-center w-10 h-10 text-white rounded-full cursor-pointer transition-all hover:bg-black/40"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Settings className="w-6 h-6" />
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-2 min-w-[240px] bg-black/95 backdrop-blur-sm rounded-lg overflow-hidden shadow-xl z-50"
          onClick={e => e.stopPropagation()}
        >
          {currentView === 'main' && (
            <MainMenu
              hasQualityOptions={hasQualityOptions}
              currentQualityLabel={currentQualityLabel}
              currentSpeedLabel={currentSpeedLabel}
              hasSubtitles={hasSubtitles}
              currentSubtitleLabel={currentSubtitleLabel}
              onQualityClick={() => setCurrentView('quality')}
              onSpeedClick={() => setCurrentView('speed')}
              onSubtitlesClick={() => setCurrentView('subtitles')}
            />
          )}

          {currentView === 'quality' && (
            <QualitySubmenu
              options={qualityOptions}
              currentValue={currentQuality}
              onSelect={handleQualitySelect}
              onBack={() => setCurrentView('main')}
            />
          )}

          {currentView === 'speed' && (
            <SpeedSubmenu
              currentValue={playbackRate}
              onSelect={handleSpeedSelect}
              onBack={() => setCurrentView('main')}
            />
          )}

          {currentView === 'subtitles' && (
            <SubtitlesSubmenu
              textTracks={textTracks}
              selectedLang={selectedSubtitleLang}
              onSelect={handleSubtitleSelect}
              onBack={() => setCurrentView('main')}
            />
          )}
        </div>
      )}
    </div>
  )
})

interface MainMenuProps {
  hasQualityOptions: boolean
  currentQualityLabel: string
  currentSpeedLabel: string
  hasSubtitles: boolean
  currentSubtitleLabel: string
  onQualityClick: () => void
  onSpeedClick: () => void
  onSubtitlesClick: () => void
}

const MainMenu = memo(function MainMenu({
  hasQualityOptions,
  currentQualityLabel,
  currentSpeedLabel,
  hasSubtitles,
  currentSubtitleLabel,
  onQualityClick,
  onSpeedClick,
  onSubtitlesClick,
}: MainMenuProps) {
  return (
    <div role="menu">
      {hasQualityOptions && (
        <MenuItem label="Quality" value={currentQualityLabel} onClick={onQualityClick} hasSubmenu />
      )}
      <MenuItem
        label="Playback speed"
        value={currentSpeedLabel}
        onClick={onSpeedClick}
        hasSubmenu
      />
      {hasSubtitles && (
        <MenuItem
          label="Subtitles"
          value={currentSubtitleLabel}
          onClick={onSubtitlesClick}
          hasSubmenu
        />
      )}
    </div>
  )
})

interface QualitySubmenuProps {
  options: QualityOption[]
  currentValue: number
  onSelect: (value: number) => void
  onBack: () => void
}

const QualitySubmenu = memo(function QualitySubmenu({
  options,
  currentValue,
  onSelect,
  onBack,
}: QualitySubmenuProps) {
  return (
    <div role="menu">
      <SubmenuHeader title="Quality" onBack={onBack} />
      {options.map(option => (
        <SelectableItem
          key={option.value}
          label={option.label}
          isSelected={option.value === currentValue}
          onClick={() => onSelect(option.value)}
        />
      ))}
    </div>
  )
})

interface SpeedSubmenuProps {
  currentValue: number
  onSelect: (value: number) => void
  onBack: () => void
}

const SpeedSubmenu = memo(function SpeedSubmenu({
  currentValue,
  onSelect,
  onBack,
}: SpeedSubmenuProps) {
  return (
    <div role="menu">
      <SubmenuHeader title="Playback speed" onBack={onBack} />
      {PLAYBACK_SPEEDS.map(speed => (
        <SelectableItem
          key={speed.value}
          label={speed.label}
          isSelected={speed.value === currentValue}
          onClick={() => onSelect(speed.value)}
        />
      ))}
    </div>
  )
})

interface SubtitlesSubmenuProps {
  textTracks: TextTrack[]
  selectedLang: string
  onSelect: (lang: string) => void
  onBack: () => void
}

const SubtitlesSubmenu = memo(function SubtitlesSubmenu({
  textTracks,
  selectedLang,
  onSelect,
  onBack,
}: SubtitlesSubmenuProps) {
  return (
    <div role="menu">
      <SubmenuHeader title="Subtitles" onBack={onBack} />
      <SelectableItem label="Off" isSelected={selectedLang === ''} onClick={() => onSelect('')} />
      {textTracks.map(track => (
        <SelectableItem
          key={track.lang}
          label={getLanguageLabel(track.lang)}
          isSelected={track.lang === selectedLang}
          onClick={() => onSelect(track.lang)}
        />
      ))}
    </div>
  )
})

interface MenuItemProps {
  label: string
  value: string
  onClick: () => void
  hasSubmenu?: boolean
}

const MenuItem = memo(function MenuItem({
  label,
  value,
  onClick,
  hasSubmenu = false,
}: MenuItemProps) {
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-4 w-full px-4 py-2.5 text-white text-sm hover:bg-white/10 transition-colors"
      onClick={onClick}
      role="menuitem"
    >
      <span className="whitespace-nowrap text-left">{label}</span>
      <span className="flex items-center gap-1 text-white/70 whitespace-nowrap">
        <span>{value}</span>
        {hasSubmenu && <ChevronRight className="w-4 h-4" />}
      </span>
    </button>
  )
})

interface SubmenuHeaderProps {
  title: string
  onBack: () => void
}

const SubmenuHeader = memo(function SubmenuHeader({ title, onBack }: SubmenuHeaderProps) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 w-full px-4 py-2.5 text-white text-sm border-b border-white/10 hover:bg-white/10 transition-colors"
      onClick={onBack}
    >
      <span className="w-5 h-5 flex items-center justify-center">
        <ChevronLeft className="w-5 h-5" />
      </span>
      <span>{title}</span>
    </button>
  )
})

interface SelectableItemProps {
  label: string
  isSelected: boolean
  onClick: () => void
}

const SelectableItem = memo(function SelectableItem({
  label,
  isSelected,
  onClick,
}: SelectableItemProps) {
  return (
    <button
      type="button"
      className={`flex items-center gap-3 w-full px-4 py-2.5 text-white text-sm transition-colors text-left ${
        isSelected ? 'bg-white/15' : 'hover:bg-white/10'
      }`}
      onClick={onClick}
      role="menuitemradio"
      aria-checked={isSelected}
    >
      <span className="w-5 h-5 flex items-center justify-center">
        {isSelected && <Check className="w-5 h-5 text-primary" />}
      </span>
      <span>{label}</span>
    </button>
  )
})
