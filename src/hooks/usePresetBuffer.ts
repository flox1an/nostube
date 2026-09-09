import { useCallback } from 'react'
import { useAppContext } from './useAppContext'
import { type PresetBufferList, type PresetModerationEntry } from '@/types/preset'

const EMPTY: PresetModerationEntry[] = []

/**
 * Local staging list for admin moderation actions ("add author to NSFW/blocked",
 * "block this video"). Entries are collected from video card menus and applied
 * in bulk from /admin — adding never publishes anything.
 *
 * One entry per value: adding the same value again replaces it (last click wins),
 * which also moves an entry between the NSFW and blocked lists.
 */
export function usePresetBuffer() {
  const { config, updateConfig } = useAppContext()
  const entries = config.presetModerationBuffer ?? EMPTY

  const addEntry = useCallback(
    (value: string, list: PresetBufferList, source?: string) => {
      updateConfig(current => {
        const rest = (current.presetModerationBuffer ?? []).filter(e => e.value !== value)
        return {
          ...current,
          presetModerationBuffer: [...rest, { value, list, source, addedAt: Date.now() }],
        }
      })
    },
    [updateConfig]
  )

  const removeEntries = useCallback(
    (values: string[]) => {
      const drop = new Set(values)
      updateConfig(current => ({
        ...current,
        presetModerationBuffer: (current.presetModerationBuffer ?? []).filter(
          e => !drop.has(e.value)
        ),
      }))
    },
    [updateConfig]
  )

  const has = useCallback((value: string) => entries.some(e => e.value === value), [entries])

  return { entries, addEntry, removeEntries, has }
}
