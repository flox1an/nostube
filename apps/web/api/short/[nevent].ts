import { handleVideoPage } from '../_nostr.js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  const url = new URL(request.url)
  const nevent = url.pathname.split('/')[2]
  if (!nevent) {
    return new Response('Not found', { status: 404 })
  }
  return handleVideoPage(request, nevent, 'short')
}
