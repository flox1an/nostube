import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { VideoEvent } from '@/utils/video-event'

interface ShortsFeedState {
  // Current list of videos in the feed
  videos: VideoEvent[]
  // Current video index
  currentIndex: number
  // Loading state
  isLoading: boolean
}

interface ShortsFeedActions {
  // Set the entire video list and optionally the starting index
  setVideos: (videos: VideoEvent[], startIndex?: number) => void
  // Set only the current index
  setCurrentIndex: (index: number) => void
  // Navigate to next/previous video
  nextVideo: () => void
  previousVideo: () => void
  // Add more videos to the list (for infinite scroll/pagination)
  appendVideos: (videos: VideoEvent[]) => void
  // Set loading state
  setLoading: (isLoading: boolean) => void
  // Clear the feed
  clearFeed: () => void
  // Get current video
  getCurrentVideo: () => VideoEvent | null
}

type ShortsFeedStore = ShortsFeedState & ShortsFeedActions

const initialState: ShortsFeedState = {
  videos: [],
  currentIndex: 0,
  isLoading: false,
}

export const useShortsFeedStore = create<ShortsFeedStore>()(
  immer((set, get) => ({
    ...initialState,

    setVideos: (videos, startIndex = 0) => {
      set(state => {
        state.videos = videos
        state.currentIndex = Math.max(0, Math.min(startIndex, videos.length - 1))
        state.isLoading = false
      })
    },

    setCurrentIndex: (index: number) => {
      set(state => {
        const maxIndex = Math.max(0, state.videos.length - 1)
        state.currentIndex = Math.max(0, Math.min(index, maxIndex))
      })
    },

    nextVideo: () => {
      set(state => {
        if (state.currentIndex < state.videos.length - 1) {
          state.currentIndex += 1
        }
      })
    },

    previousVideo: () => {
      set(state => {
        if (state.currentIndex > 0) {
          state.currentIndex -= 1
        }
      })
    },

    appendVideos: (newVideos: VideoEvent[]) => {
      set(state => {
        // Deduplicate by ID
        const existingIds = new Set(state.videos.map(v => v.id))
        const uniqueNewVideos = newVideos.filter(v => !existingIds.has(v.id))
        state.videos.push(...uniqueNewVideos)
      })
    },

    setLoading: (isLoading: boolean) => {
      set(state => {
        state.isLoading = isLoading
      })
    },

    clearFeed: () => {
      set(state => {
        state.videos = []
        state.currentIndex = 0
        state.isLoading = false
      })
    },

    getCurrentVideo: () => {
      const state = get()
      return state.videos[state.currentIndex] || null
    },
  }))
)
