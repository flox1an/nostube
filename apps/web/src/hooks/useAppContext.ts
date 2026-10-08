import { useContext } from 'react'
import { AppContext, type AppContextType } from '@/contexts/AppContext'

/**
 * Hook to access and update application configuration
 * @returns Application context with config and update methods
 * @throws Error if used outside of AppProvider
 */
export function useAppContext(): AppContextType {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}

/**
 * Safe version of useAppContext that returns undefined instead of throwing
 * Useful for components that may be rendered outside of AppProvider (e.g., embed player)
 * @returns Application context or undefined if not within AppProvider
 */
export function useAppContextSafe(): AppContextType | undefined {
  return useContext(AppContext)
}
