export const config = { runtime: 'edge' }

export default function handler() {
  return new Response(JSON.stringify({ hello: 'world', ts: Date.now() }), {
    headers: { 'content-type': 'application/json' },
  })
}
