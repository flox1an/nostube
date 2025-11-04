/**
 * Error handling utilities for consistent error messages and logging
 */

export type ErrorCategory =
  | 'network'
  | 'authentication'
  | 'permission'
  | 'validation'
  | 'notfound'
  | 'unknown'

export interface AppError {
  message: string
  category: ErrorCategory
  originalError?: Error
  recoverable: boolean
}

/**
 * Categorize an error and provide user-friendly messages
 */
export function categorizeError(error: unknown): AppError {
  const err = error instanceof Error ? error : new Error(String(error))

  // Network errors
  if (
    err.message.includes('fetch') ||
    err.message.includes('network') ||
    err.message.includes('NetworkError')
  ) {
    return {
      message: 'Network connection failed. Please check your internet connection and try again.',
      category: 'network',
      originalError: err,
      recoverable: true,
    }
  }

  // Authentication errors
  if (
    err.message.includes('auth') ||
    err.message.includes('unauthorized') ||
    err.message.includes('login')
  ) {
    return {
      message: 'Authentication failed. Please log in again.',
      category: 'authentication',
      originalError: err,
      recoverable: true,
    }
  }

  // Permission errors
  if (err.message.includes('permission') || err.message.includes('forbidden')) {
    return {
      message: "You don't have permission to perform this action.",
      category: 'permission',
      originalError: err,
      recoverable: false,
    }
  }

  // Not found errors
  if (err.message.includes('not found') || err.message.includes('404')) {
    return {
      message: 'The requested content was not found.',
      category: 'notfound',
      originalError: err,
      recoverable: false,
    }
  }

  // Validation errors
  if (err.message.includes('validation') || err.message.includes('invalid')) {
    return {
      message: 'The provided data is invalid. Please check your input.',
      category: 'validation',
      originalError: err,
      recoverable: true,
    }
  }

  // Unknown errors
  return {
    message: 'An unexpected error occurred. Please try again.',
    category: 'unknown',
    originalError: err,
    recoverable: true,
  }
}

/**
 * Log error with appropriate level based on category
 */
export function logError(error: AppError, context?: string) {
  if (!import.meta.env.DEV) return

  const prefix = context ? `[${context}]` : '[Error]'

  console.error(prefix, {
    message: error.message,
    category: error.category,
    recoverable: error.recoverable,
    original: error.originalError,
  })
}

/**
 * Handle errors consistently across the application
 */
export function handleError(error: unknown, context?: string): AppError {
  const appError = categorizeError(error)
  logError(appError, context)
  return appError
}
