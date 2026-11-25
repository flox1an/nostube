/**
 * Remembers which profile (kind 0) lookups a relay set has already been asked
 * for, so a remounting card or a later render wave does not fire the same REQ
 * again. Kind 0 is replaceable and changes rarely; a miss is retried after
 * {@link PROFILE_REQUEST_TTL_MS}, which is also the cost of a profile that no
 * relay in the set carries.
 */
export const PROFILE_REQUEST_TTL_MS = 5 * 60_000

/** `${scope}|${pubkey}` → time of the last request. */
const requested = new Map<string, number>()

/**
 * True when this pubkey has not been requested from this relay set within the
 * TTL. Records the request as a side effect.
 */
export function allowProfileRequest(
  scope: string,
  pubkey: string,
  now: number = Date.now()
): boolean {
  const key = `${scope}|${pubkey}`
  const last = requested.get(key)
  if (last !== undefined && now - last < PROFILE_REQUEST_TTL_MS) return false
  requested.set(key, now)
  return true
}

/** Drops expired entries; call from a batch flush so the map stays small. */
export function pruneProfileRequests(now: number = Date.now()) {
  for (const [key, at] of requested) {
    if (now - at > PROFILE_REQUEST_TTL_MS) requested.delete(key)
  }
}

/** Clears the memo (tests, and a hard client reset). */
export function resetProfileRequests() {
  requested.clear()
}
