import { useState, useRef, useEffect, memo, type ReactNode } from 'react'
import {
  Settings,
  ChevronRight,
  ChevronLeft,
  Check,
  Repeat,
  Gauge,
  SlidersHorizontal,
  Captions,
} from 'lucide-react'
import { type QualityOption } from './engines'
import { type TextTrack } from '@/utils/video-event'
import { useProfile } from '@/hooks/useProfile'
import { UserAvatar } from '@/components/UserAvatar'
import { getLanguageLabel } from '@/lib/utils'

type MenuView = 'main' | 'quality' | 'speed' | 'subtitles'

function contributorDisplayName(
  profile: { display_name?: string; name?: string; picture?: string } | undefined,
  pubkey: string
): string {
  return profile?.display_name || profile?.name || pubkey.slice(0, 8)
}

interface SettingsMenuProps {
  // Quality (protocol-neutral; options are built by the playback engine)
  qualityOptions?: QualityOption[]
  selectedQuality?: number
  activeQualityLabel?: string | null
  onSelectQuality?: (id: number) => void

  // Playback speed
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void

  // Subtitles
  textTracks?: TextTrack[]
  selectedSubtitleLang?: string // empty string = off
  onSubtitleChange?: (lang: string) => void

  // Loop
  loopEnabled?: boolean
  onToggleLoop?: () => void
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
  qualityOptions = [],
  selectedQuality,
  activeQualityLabel = null,
  onSelectQuality,
  playbackRate,
  onPlaybackRateChange,
  textTracks = [],
  selectedSubtitleLang = '',
  onSubtitleChange,
  loopEnabled = false,
  onToggleLoop,
}: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentView, setCurrentView] = useState<MenuView>('main')
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const selectedQualityOption = qualityOptions.find(q => q.id === selectedQuality)
  const selectedContributorProfile = useProfile(
    selectedQualityOption?.contributorPubkey
      ? { pubkey: selectedQualityOption.contributorPubkey }
      : undefined
  )
  const currentQualityLabel =
    selectedQuality === -1
      ? activeQualityLabel
        ? `Auto (${activeQualityLabel})`
        : 'Auto'
      : selectedQualityOption
        ? selectedQualityOption.contributorPubkey
          ? `${selectedQualityOption.label} (${contributorDisplayName(
              selectedContributorProfile,
              selectedQualityOption.contributorPubkey
            )})`
          : selectedQualityOption.label
        : 'Unknown'

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

  const handleQualitySelect = (id: number) => {
    onSelectQuality?.(id)
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

  const handleLoopToggle = () => {
    onToggleLoop?.()
    setIsOpen(false)
    setCurrentView('main')
  }

  // Don't show the quality menu for single-quality sources
  const hasQualityOptions = qualityOptions.length > 1
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
              loopEnabled={loopEnabled}
              onQualityClick={() => setCurrentView('quality')}
              onSpeedClick={() => setCurrentView('speed')}
              onSubtitlesClick={() => setCurrentView('subtitles')}
              onLoopClick={handleLoopToggle}
            />
          )}

          {currentView === 'quality' && (
            <QualitySubmenu
              options={qualityOptions}
              currentValue={selectedQuality}
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
  loopEnabled: boolean
  onQualityClick: () => void
  onSpeedClick: () => void
  onSubtitlesClick: () => void
  onLoopClick: () => void
}

const MainMenu = memo(function MainMenu({
  hasQualityOptions,
  currentQualityLabel,
  currentSpeedLabel,
  hasSubtitles,
  currentSubtitleLabel,
  loopEnabled,
  onQualityClick,
  onSpeedClick,
  onSubtitlesClick,
  onLoopClick,
}: MainMenuProps) {
  return (
    <div role="menu">
      {hasQualityOptions && (
        <MenuItem
          label="Quality"
          value={currentQualityLabel}
          onClick={onQualityClick}
          hasSubmenu
          icon={<SlidersHorizontal className="w-4 h-4" />}
        />
      )}
      <MenuItem
        label="Playback speed"
        value={currentSpeedLabel}
        onClick={onSpeedClick}
        hasSubmenu
        icon={<Gauge className="w-4 h-4" />}
      />
      {hasSubtitles && (
        <MenuItem
          label="Subtitles"
          value={currentSubtitleLabel}
          onClick={onSubtitlesClick}
          hasSubmenu
          icon={<Captions className="w-4 h-4" />}
        />
      )}
      <ToggleMenuItem
        label="Loop"
        enabled={loopEnabled}
        onClick={onLoopClick}
        icon={<Repeat className="w-4 h-4" />}
      />
    </div>
  )
})

interface QualitySubmenuProps {
  options: QualityOption[]
  currentValue: number | undefined
  onSelect: (id: number) => void
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
        <QualitySelectableItem
          key={option.id}
          option={option}
          isSelected={option.id === currentValue}
          onClick={() => onSelect(option.id)}
        />
      ))}
    </div>
  )
})

const QualitySelectableItem = memo(function QualitySelectableItem({
  option,
  isSelected,
  onClick,
}: {
  option: QualityOption
  isSelected: boolean
  onClick: () => void
}) {
  const contributorProfile = useProfile(
    option.contributorPubkey ? { pubkey: option.contributorPubkey } : undefined
  )
  const contributorName = option.contributorPubkey
    ? contributorDisplayName(contributorProfile, option.contributorPubkey)
    : undefined
  const label =
    option.contributorPubkey && contributorName ? (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span>{option.label} (</span>
        <span data-contributor-avatar className="h-4 w-4 shrink-0" aria-hidden="true">
          <UserAvatar
            picture={contributorProfile?.picture}
            pubkey={option.contributorPubkey}
            name={contributorName}
            className="h-4 w-4"
          />
        </span>
        <span className="truncate">{contributorName})</span>
      </span>
    ) : (
      option.label
    )

  return (
    <SelectableItem
      label={label}
      description={option.description}
      isSelected={isSelected}
      onClick={onClick}
    />
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
  icon?: ReactNode
}

const MenuItem = memo(function MenuItem({
  label,
  value,
  onClick,
  hasSubmenu = false,
  icon,
}: MenuItemProps) {
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-4 w-full px-4 py-2.5 text-white text-sm hover:bg-white/10 transition-colors"
      onClick={onClick}
      role="menuitem"
    >
      <span className="flex items-center gap-2 whitespace-nowrap text-left">
        {icon}
        <span>{label}</span>
      </span>
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
  label: ReactNode
  description?: string
  isSelected: boolean
  onClick: () => void
}

const SelectableItem = memo(function SelectableItem({
  label,
  description,
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
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {description && <span className="block truncate text-xs text-white/60">{description}</span>}
      </span>
    </button>
  )
})

interface ToggleMenuItemProps {
  label: string
  enabled: boolean
  onClick: () => void
  icon?: React.ReactNode
}

const ToggleMenuItem = memo(function ToggleMenuItem({
  label,
  enabled,
  onClick,
  icon,
}: ToggleMenuItemProps) {
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-4 w-full px-4 py-2.5 text-white text-sm hover:bg-white/10 transition-colors"
      onClick={onClick}
      role="menuitemcheckbox"
      aria-checked={enabled}
    >
      <span className="flex items-center gap-2 whitespace-nowrap text-left">
        {icon}
        <span>{label}</span>
      </span>
      <span
        className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
          enabled ? 'bg-primary border-primary' : 'border-white/50'
        }`}
      >
        {enabled && <Check className="w-3 h-3 text-white" />}
      </span>
    </button>
  )
})
