import { vi } from 'vitest'

/** A request the studio made: method, path (no query), parsed JSON body, and what it sent. */
export interface AdminCall {
  method: string
  path: string
  url: URL
  /** The JSON body parsed; a raw body (an image) as sent; undefined without one. */
  body: unknown
  init: RequestInit | undefined
}

/** A route's answer: JSON to send, a ready `Response`, or a function of the call giving either. */
type Answer = unknown | ((call: AdminCall) => unknown)

/**
 * The instance as the studio's tests see it: `routes` maps `"METHOD /path"` to an answer; any
 * other request is answered 404. Replaces `fetch` until `vi.unstubAllGlobals()`. Answers the
 * calls made, in order, and `sent(key)`: the bodies sent to one route.
 */
export function fakeAdminApi(routes: Record<string, Answer>) {
  const calls: AdminCall[] = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://studio.test')
    const raw = init?.body
    let body: unknown = raw ?? undefined
    if (typeof raw === 'string') {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    const call = { method: init?.method ?? 'GET', path: url.pathname, url, body, init }
    calls.push(call)
    const route = routes[`${call.method} ${call.path}`]
    if (route === undefined)
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    // A fixed Response is cloned: a route may be asked more than once.
    const answer =
      typeof route === 'function'
        ? await route(call)
        : route instanceof Response
          ? route.clone()
          : route
    return answer instanceof Response ? answer : new Response(JSON.stringify(answer ?? null))
  })
  vi.stubGlobal('fetch', fetch)
  return {
    calls,
    sent: (key: string) => calls.filter(c => `${c.method} ${c.path}` === key).map(c => c.body),
  }
}

/** A refusal as the instance sends it: `{ error }` with `status`. */
export const refusal = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status })
