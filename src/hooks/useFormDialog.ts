import { useState, useCallback } from 'react'
import { useToast } from './useToast'

interface UseFormDialogOptions<T> {
  /**
   * Initial form data
   */
  initialData: T

  /**
   * Function to submit the form data
   */
  onSubmit: (data: T) => Promise<void>

  /**
   * Optional callback to close the dialog
   */
  onClose?: () => void

  /**
   * Optional success message
   */
  successMessage?: string

  /**
   * Optional validation function
   * @returns Error message if validation fails, undefined if valid
   */
  validate?: (data: T) => string | undefined
}

/**
 * Hook for managing form state in dialogs with loading, validation, and toast notifications.
 * Encapsulates the common pattern of form submission with error handling.
 *
 * @example
 * const { data, setData, isSubmitting, handleSubmit, resetForm } = useFormDialog({
 *   initialData: { name: '', description: '' },
 *   onSubmit: async (data) => await createPlaylist(data.name, data.description),
 *   onClose: () => setOpen(false),
 *   successMessage: 'Playlist created successfully',
 *   validate: (data) => !data.name.trim() ? 'Name is required' : undefined
 * })
 */
export function useFormDialog<T extends Record<string, unknown>>({
  initialData,
  onSubmit,
  onClose,
  successMessage,
  validate,
}: UseFormDialogOptions<T>) {
  const [data, setData] = useState<T>(initialData)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault()
      }

      // Validate if validation function provided
      if (validate) {
        const error = validate(data)
        if (error) {
          toast({
            title: 'Validation Error',
            description: error,
            variant: 'destructive',
          })
          return false
        }
      }

      setIsSubmitting(true)
      try {
        await onSubmit(data)

        if (successMessage) {
          toast({
            title: 'Success',
            description: successMessage,
          })
        }

        // Reset form after successful submission
        setData(initialData)

        // Close dialog if callback provided
        onClose?.()

        return true
      } catch (error) {
        console.error(error)
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        })
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [data, onSubmit, onClose, successMessage, validate, toast, initialData]
  )

  const resetForm = useCallback(() => {
    setData(initialData)
  }, [initialData])

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setData(prev => ({ ...prev, [field]: value }))
  }, [])

  return {
    data,
    setData,
    updateField,
    isSubmitting,
    handleSubmit,
    resetForm,
  }
}
