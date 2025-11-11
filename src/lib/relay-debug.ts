/**
 * Relay subscription debugging utilities
 * Helps track and monitor relay subscriptions to prevent over-subscription
 */

// Track active subscriptions
const activeSubscriptions = new Map<string, { timestamp: number; filters: any; relays: string[] }>()
let subscriptionCounter = 0

export function logSubscriptionCreated(name: string, relays: string[], filters: any): string {
  subscriptionCounter++
  const id = `${name}-${subscriptionCounter}-${Date.now()}`

  activeSubscriptions.set(id, {
    timestamp: Date.now(),
    filters,
    relays,
  })

  if (import.meta.env.DEV) {
    console.log(
      `[Relay] 🟢 SUBSCRIBE ${id}`,
      `\n  Relays: ${relays.length} (${relays.slice(0, 3).join(', ')}${relays.length > 3 ? '...' : ''})`,
      `\n  Filters:`,
      filters,
      `\n  Active subscriptions: ${activeSubscriptions.size}`
    )
  }

  return id
}

export function logSubscriptionClosed(id: string) {
  const sub = activeSubscriptions.get(id)

  if (sub) {
    const duration = Date.now() - sub.timestamp
    activeSubscriptions.delete(id)

    if (import.meta.env.DEV) {
      console.log(
        `[Relay] 🔴 UNSUBSCRIBE ${id}`,
        `\n  Duration: ${(duration / 1000).toFixed(2)}s`,
        `\n  Active subscriptions: ${activeSubscriptions.size}`
      )
    }
  } else if (import.meta.env.DEV) {
    console.warn(`[Relay] ⚠️ UNSUBSCRIBE attempted on unknown subscription: ${id}`)
  }
}

export function logSubscriptionStats() {
  if (import.meta.env.DEV) {
    console.log(
      `[Relay] 📊 STATS`,
      `\n  Active subscriptions: ${activeSubscriptions.size}`,
      `\n  Total created: ${subscriptionCounter}`
    )

    if (activeSubscriptions.size > 0) {
      console.log(`\n  Active subscription details:`)
      for (const [id, sub] of activeSubscriptions.entries()) {
        const age = ((Date.now() - sub.timestamp) / 1000).toFixed(2)
        console.log(`    - ${id} (${age}s old, ${sub.relays.length} relays)`)
      }
    }
  }

  return {
    active: activeSubscriptions.size,
    total: subscriptionCounter,
  }
}

// Auto-log stats every 10 seconds in development
if (import.meta.env.DEV) {
  setInterval(() => {
    if (activeSubscriptions.size > 10) {
      console.warn(
        `[Relay] ⚠️ HIGH SUBSCRIPTION COUNT: ${activeSubscriptions.size} active subscriptions`
      )
      logSubscriptionStats()
    }
  }, 10000)
}
