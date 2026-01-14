import { useState, useCallback } from 'react'

/**
 * A hook for managing dialog open/close state with common patterns.
 * Reduces boilerplate for dialog state management across components.
 *
 * @param initialOpen - Initial open state (default: false)
 * @returns Object with open state and control functions
 *
 * @example
 * ```tsx
 * const dialog = useDialogState()
 *
 * <Dialog open={dialog.open} onOpenChange={dialog.setOpen}>
 *   <DialogTrigger asChild>
 *     <Button onClick={dialog.openDialog}>Open</Button>
 *   </DialogTrigger>
 *   ...
 * </Dialog>
 * ```
 *
 * @example With data
 * ```tsx
 * const dialog = useDialogState<Playlist>()
 *
 * // Open with specific item
 * onClick={() => dialog.openWith(playlist)}
 *
 * // Access in dialog
 * {dialog.data && <span>{dialog.data.name}</span>}
 * ```
 */
export function useDialogState<T = undefined>(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)
  const [data, setData] = useState<T | undefined>(undefined)

  const openDialog = useCallback(() => {
    setOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setOpen(false)
    setData(undefined)
  }, [])

  const toggle = useCallback(() => {
    setOpen(prev => !prev)
  }, [])

  const openWith = useCallback((item: T) => {
    setData(item)
    setOpen(true)
  }, [])

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      setData(undefined)
    }
  }, [])

  return {
    /** Current open state */
    open,
    /** Set open state directly (compatible with Dialog onOpenChange) */
    setOpen: handleOpenChange,
    /** Open the dialog */
    openDialog,
    /** Close the dialog and clear data */
    closeDialog,
    /** Toggle open state */
    toggle,
    /** Open dialog with associated data */
    openWith,
    /** Data passed via openWith */
    data,
    /** Clear data without closing */
    clearData: () => setData(undefined),
  }
}

export type DialogState<T = undefined> = ReturnType<typeof useDialogState<T>>
