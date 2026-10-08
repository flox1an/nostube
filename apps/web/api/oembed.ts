import { handleOEmbed } from './_nostr.js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  return handleOEmbed(request)
}
