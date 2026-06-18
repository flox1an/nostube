import { useEventStore } from 'applesauce-react/hooks'
import { useNostrPublish } from './useNostrPublish'

export function useProfilePublish() {
  const eventStore = useEventStore()
  const { publish, isPending } = useNostrPublish()

  const publishProfile = async (profile: Record<string, unknown>) => {
    const event = await publish({
      event: {
        kind: 0,
        content: JSON.stringify(profile),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      },
    })
    eventStore.add(event)
    return event
  }

  return { publishProfile, isPending }
}
