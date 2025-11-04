import { useState, useCallback } from 'react'

export interface AsyncErrorState {
  error: Error | null
  isError: boolean
  retry: () => void
  reset: () => void
}

interface UseAsyncErrorOptions {
  maxRetries?: number
  onError?: (error: Error) => void
}

/**
 * Hook to handle async errors with retry logic
 */
export function useAsyncError<T extends (...args: any[]) => Promise<any>>(
  asyncFn: T,
  options: UseAsyncErrorOptions = {}
): [(...args: Parameters<T>) => Promise<ReturnType<T> | void>, AsyncErrorState] {
  const { maxRetries = 3, onError } = options
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [lastArgs, setLastArgs] = useState<Parameters<T> | null>(null)

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | void> => {
      setLastArgs(args as Parameters<T>)

      try {
        const result = await asyncFn(...args)
        setError(null)
        setRetryCount(0)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)

        if (import.meta.env.DEV) {
          console.error('Async error:', error)
        }

        onError?.(error)
      }
    },
    [asyncFn, onError]
  )

  const retry = useCallback(() => {
    if (retryCount < maxRetries && lastArgs) {
      setRetryCount(prev => prev + 1)
      execute(...lastArgs)
    }
  }, [execute, lastArgs, maxRetries, retryCount])

  const reset = useCallback(() => {
    setError(null)
    setRetryCount(0)
    setLastArgs(null)
  }, [])

  return [
    execute,
    {
      error,
      isError: error !== null,
      retry,
      reset,
    },
  ]
}
