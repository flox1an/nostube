import { handleVideoPage } from '../_nostr.js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  const url = new URL(request.url)
  const nip19 = url.pathname.split('/')[2]
  if (!nip19) {
    return new Response('Not found', { status: 404 })
  }
  return handleVideoPage(request, nip19, 'playlist')
}
