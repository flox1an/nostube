/**
 * Hook to get the currently selected preset
 *
 * This is a convenience wrapper around usePresetContext for backwards compatibility.
 * The actual preset loading is handled by PresetProvider which blocks app rendering
 * until the preset is successfully loaded.
 */
export { usePresetContext as useSelectedPreset } from '@/contexts/PresetContext'
