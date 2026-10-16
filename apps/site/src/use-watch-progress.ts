import { useCallback, useState } from 'react'
import {
  forgetWatchProgress,
  isResumable,
  parseWatchProgress,
  recordWatchProgress,
  type WatchProgress,
} from '@nostube/core/watch-progress'

/** Device-local only: never sent anywhere, and the privacy page says so. */
const STORAGE_KEY = 'nostube-site:watch-progress'

function read(): WatchProgress[] {
  try {
    return parseWatchProgress(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function write(list: WatchProgress[]) {
  try {
    if (list.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage full or blocked: resuming is a convenience, never an error.
  }
}

/** The saved position of one video, read once (a page that starts at it). */
export const savedProgress = (ref: string) => read().find(entry => entry.ref === ref)

/** Stores a position; a finished or just-opened video is removed instead. */
export const saveProgress = (ref: string, time: number, duration: number) =>
  write(recordWatchProgress(read(), { ref, time, duration }))

export const forgetProgress = (ref: string) => write(forgetWatchProgress(read(), ref))

/** The unfinished videos on this device, newest first, with a way to clear them all. */
export function useWatchProgressList() {
  const [list, setList] = useState(() => read().filter(isResumable))
  const clear = useCallback(() => {
    write([])
    setList([])
  }, [])
  return { list, clear }
}
