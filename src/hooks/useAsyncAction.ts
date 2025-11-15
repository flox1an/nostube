import { useState, useCallback } from 'react'
import { useToast } from './useToast'

/**
 * Hook for handling async actions with loading state and toast notifications.
 * Simplifies error handling and loading states for async operations like API calls.
 *
 * @example
 * const { isLoading, execute } = useAsyncAction()
 * await execute(() => deleteVideo(id), 'Video deleted successfully')
 *
 * @returns Object with isLoading state and execute function
 */
export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const execute = useCallback(
    async (
      fn: () => Promise<void>,
      successMessage?: string,
      options?: {
        errorMessage?: string
        onSuccess?: () => void
        onError?: (error: Error) => void
      }
    ): Promise<boolean> => {
      setIsLoading(true)
      try {
        await fn()
        if (successMessage) {
          toast({
            title: 'Success',
            description: successMessage,
          })
        }
        options?.onSuccess?.()
        return true
      } catch (error) {
        console.error(error)
        toast({
          title: 'Error',
          description:
            options?.errorMessage ||
            (error instanceof Error ? error.message : 'An error occurred'),
          variant: 'destructive',
        })
        options?.onError?.(error instanceof Error ? error : new Error('Unknown error'))
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [toast]
  )

  return { isLoading, execute }
}
