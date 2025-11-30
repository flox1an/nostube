import { useEffect } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { updateLastLoginTime } from '../lib/notification-storage'

export function useLoginTimeTracking() {
  const { user } = useCurrentUser()

  useEffect(() => {
    if (user) {
      updateLastLoginTime()
    }
  }, [user])
}
