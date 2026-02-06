import { useState, useEffect } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { getProfileContent } from 'applesauce-core/helpers'
import { kinds } from 'nostr-tools'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { useAppContext } from './useAppContext'
import type { TaggedPerson } from '@/types/upload-draft'
import { DEFAULT_RELAYS } from '@/nostr/core'
import { METADATA_RELAY } from '@/constants/relays'

/**
 * Hook to load profile data for a pubkey and return a TaggedPerson object.
 * Useful for programmatically adding people to the PeoplePicker.
 *
 * @param pubkey - The pubkey to load profile data for
 * @param relays - Optional array of relay URLs to load from
 * @returns TaggedPerson object with loaded profile data, or null if loading/error
 *
 * @example
 * const person = useLoadTaggedPerson('npub...')
 * if (person) {
 *   setPeople(prev => [...prev, person])
 * }
 */
export function useLoadTaggedPerson(
  pubkey: string | undefined,
  relays?: string[]
): TaggedPerson | null {
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const [person, setPerson] = useState<TaggedPerson | null>(null)

  useEffect(() => {
    if (!pubkey) {
      queueMicrotask(() => setPerson(null))
      return
    }

    // Check if profile is already in the store
    const existingEvent = eventStore.getReplaceable(kinds.Metadata, pubkey)
    if (existingEvent) {
      const profile = getProfileContent(existingEvent)
      if (profile) {
        queueMicrotask(() =>
          setPerson({
            pubkey,
            name: profile.name || profile.display_name || pubkey.slice(0, 8),
            picture: profile.picture,
            relays: relays || [],
          })
        )
        return
      }
    }

    // Profile not in store, load from relays
    // Use provided relays or fall back to default + metadata-specialized relays
    const queryRelays = relays && relays.length > 0 ? relays : [...DEFAULT_RELAYS, METADATA_RELAY]
    const loader = createTimelineLoader(
      pool,
      queryRelays,
      {
        kinds: [kinds.Metadata],
        authors: [pubkey],
      },
      {
        eventStore,
        limit: 1,
      }
    )

    const subscription = loader().subscribe({
      next: event => {
        const profile = getProfileContent(event)
        if (profile) {
          setPerson({
            pubkey,
            name: profile.name || profile.display_name || pubkey.slice(0, 8),
            picture: profile.picture,
            relays: relays || [],
          })
        }
      },
      error: err => {
        console.error('[useLoadTaggedPerson] Error loading profile:', err)
        // Set fallback person with just pubkey
        setPerson({
          pubkey,
          name: pubkey.slice(0, 8),
          relays: relays || [],
        })
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [pubkey, eventStore, pool, relays])

  return person
}

/**
 * Helper function to load multiple tagged people at once.
 * Returns a promise that resolves when all profiles are loaded.
 *
 * @param pubkeys - Array of pubkeys to load
 * @param eventStore - EventStore instance
 * @param pool - RelayPool instance
 * @param relays - Optional array of relay URLs
 * @returns Promise<TaggedPerson[]>
 *
 * @example
 * const people = await loadTaggedPeople(['npub1...', 'npub2...'], eventStore, pool)
 * setPeople(people)
 */
export async function loadTaggedPeople(
  pubkeys: string[],
  eventStore: any,
  pool: any,
  relays?: string[]
): Promise<TaggedPerson[]> {
  const people: TaggedPerson[] = []

  for (const pubkey of pubkeys) {
    try {
      // Check if profile is already in the store
      const existingEvent = eventStore.getReplaceable(kinds.Metadata, pubkey)
      if (existingEvent) {
        const profile = getProfileContent(existingEvent)
        if (profile) {
          people.push({
            pubkey,
            name: profile.name || profile.display_name || pubkey.slice(0, 8),
            picture: profile.picture,
            relays: relays || [],
          })
          continue
        }
      }

      // Profile not in store, load from relays
      // Use provided relays or fall back to default + metadata-specialized relays
      const queryRelays = relays && relays.length > 0 ? relays : [...DEFAULT_RELAYS, METADATA_RELAY]
      const loader = createTimelineLoader(
        pool,
        queryRelays,
        {
          kinds: [kinds.Metadata],
          authors: [pubkey],
        },
        {
          eventStore,
          limit: 1,
        }
      )

      // Wait for profile to load
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          subscription.unsubscribe()
          reject(new Error('Profile load timeout'))
        }, 5000)

        const subscription = loader().subscribe({
          next: event => {
            const profile = getProfileContent(event)
            if (profile) {
              people.push({
                pubkey,
                name: profile.name || profile.display_name || pubkey.slice(0, 8),
                picture: profile.picture,
                relays: relays || [],
              })
            }
            clearTimeout(timeout)
            subscription.unsubscribe()
            resolve()
          },
          error: err => {
            console.error('[loadTaggedPeople] Error loading profile:', err)
            clearTimeout(timeout)
            // Add fallback person
            people.push({
              pubkey,
              name: pubkey.slice(0, 8),
              relays: relays || [],
            })
            resolve()
          },
        })
      })
    } catch (err) {
      console.error('[loadTaggedPeople] Failed to load profile for', pubkey, err)
      // Add fallback person
      people.push({
        pubkey,
        name: pubkey.slice(0, 8),
        relays: relays || [],
      })
    }
  }

  return people
}
