import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Esc leaves a video page for the grid. It does nothing while a dialog is open (the dialog takes
 * the key itself), while typing in a field, or when another handler already used the key.
 */
export function useEscapeToHome() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]'
        )
      )
        return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      navigate('/')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}
