/** Device-local only: never sent anywhere, and the privacy page says so. */
const LAST_VISIT_KEY = 'nostube-site:last-visit'
/** The previous visit, fixed for this tab's session so reloads keep showing what is new. */
const SESSION_KEY = 'nostube-site:previous-visit'

/**
 * When this browser last saw the start page (unix seconds), as of the start of this session;
 * undefined on a first visit. Records the current visit for the next session.
 * ponytail: per-tab session, so a second tab counts as a new visit; share via a timestamp window if that bites.
 */
export function previousVisit(now = Math.floor(Date.now() / 1000)): number | undefined {
  try {
    let kept = sessionStorage.getItem(SESSION_KEY)
    if (kept === null) {
      kept = localStorage.getItem(LAST_VISIT_KEY) ?? ''
      sessionStorage.setItem(SESSION_KEY, kept)
    }
    localStorage.setItem(LAST_VISIT_KEY, String(now))
    const at = Number(kept)
    return kept && Number.isFinite(at) ? at : undefined
  } catch {
    // Storage blocked: showing what is new is a convenience, never an error.
    return undefined
  }
}
