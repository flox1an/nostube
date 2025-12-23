import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUserRelays as useUserRelayList, type UserRelayInfo } from '@/hooks/useUserRelays'

interface UserRelaysContextValue {
  relays: UserRelayInfo[] | null
  readRelays: string[] | null
  writeRelays: string[] | null
}

const UserRelaysContext = createContext<UserRelaysContextValue>({
  relays: null,
  readRelays: null,
  writeRelays: null,
})

interface UserRelaysProviderProps {
  children: ReactNode
}

/**
 * Provides the logged-in user's relays (from their NIP-65 list) to the component tree.
 * Falls back to null values when no user or relay list is available so consumers can
 * gracefully use preset relays.
 */
export function UserRelaysProvider({ children }: UserRelaysProviderProps) {
  const { user } = useCurrentUser()
  const { data: relayList } = useUserRelayList(user?.pubkey)

  const value = useMemo<UserRelaysContextValue>(() => {
    if (!user || !relayList || relayList.length === 0) {
      return { relays: null, readRelays: null, writeRelays: null }
    }

    const readRelays = relayList.filter(relay => relay.read).map(relay => relay.url)
    const writeRelays = relayList.filter(relay => relay.write).map(relay => relay.url)

    return {
      relays: relayList,
      readRelays: readRelays.length > 0 ? readRelays : null,
      writeRelays: writeRelays.length > 0 ? writeRelays : null,
    }
  }, [relayList, user])

  return <UserRelaysContext.Provider value={value}>{children}</UserRelaysContext.Provider>
}

export function useUserRelaysContext(): UserRelaysContextValue {
  return useContext(UserRelaysContext)
}
