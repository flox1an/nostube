import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const DESKTOP_TRAFFIC_LIGHT_SAFE_AREA_CLASS = 'w-20'
export const DESKTOP_MAIN_TITLEBAR_HEIGHT_CLASS = 'h-14'
export const DESKTOP_PLAYER_TITLEBAR_HEIGHT_CLASS = 'h-12'

interface DesktopWindowDragRegionProps {
  children?: ReactNode
  className?: string
}

export function DesktopWindowDragRegion({ children, className }: DesktopWindowDragRegionProps) {
  return (
    <div
      data-tauri-drag-region
      className={cn('cursor-default select-none', className)}
      onMouseDown={event => {
        if (event.button === 0 && isTauri()) {
          void getCurrentWindow().startDragging()
        }
      }}
    >
      {children}
    </div>
  )
}
