import { decodeNip19 } from '@/lib/nip19'

export const PLATFORMS = [
  {
    name: 'youtube',
    color: 'bg-[#FF0000] text-white',
    regex:
      /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?/\s]{11})/i,
  },
  { name: 'tiktok', color: 'bg-[#000000] text-white', regex: /tiktok\.com\/.*\/video\/(\d+)/i },
  {
    name: 'instagram',
    color: 'bg-[#E1306C] text-white',
    regex: /instagram\.com\/(?:p|reels|reel)\/([a-zA-Z0-9_-]+)/i,
  },
  {
    name: 'twitter',
    color: 'bg-[#1DA1F2] text-white',
    regex: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  },
  { name: 'twitch', color: 'bg-[#9146FF] text-white', regex: /twitch\.tv\/videos\/(\d+)/i },
]

const NOSTR_IDENTIFIER_REGEX =
  /(?:nostr:|https?:\/\/(?:njump\.me|primal\.net)\/[ep]\/)?((?:nevent|note|naddr|npub|nprofile)1[023456789acdefghjklmnpqrstuvwxyz]+|[a-f0-9]{64})/i

const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i

export function getIdentity(tags: string[][]): string {
  const originTag = tags.find(t => t[0] === 'origin')
  if (originTag) return `${originTag[1]}:${originTag[2]}`

  const eTag = tags.find(t => t[0] === 'e')
  if (eTag) return `nostr:${eTag[1]}`

  const aTag = tags.find(t => t[0] === 'a')
  if (aTag) return `nostr:${aTag[1]}`

  const pTag = tags.find(t => t[0] === 'p')
  if (pTag) return `nostr:${pTag[1]}`

  const rTag = tags.find(t => t[0] === 'r')
  if (rTag) return rTag[1]

  return ''
}

export function getPlatformName(tags: string[][]): string {
  const originTag = tags.find(t => t[0] === 'origin')
  if (originTag) return originTag[1]

  const nostrTag = tags.find(t => ['e', 'p', 'a'].includes(t[0]))
  if (nostrTag) return 'nostr'

  return 'web'
}

export function getPlatformColor(name: string): string {
  const platform = PLATFORMS.find(p => p.name === name)
  if (platform) return platform.color
  if (name === 'nostr') return 'bg-purple-600 text-white'
  return 'bg-gray-500 text-white'
}

export function parseOriginInput(input: string): string[][] | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const tags: string[][] = []

  // Check platforms first
  for (const platform of PLATFORMS) {
    const match = trimmed.match(platform.regex)
    if (match && match[1]) {
      tags.push(['r', trimmed])
      tags.push(['origin', platform.name, match[1], trimmed])
      return tags
    }
  }

  // Check Nostr
  const nostrMatch = trimmed.match(NOSTR_IDENTIFIER_REGEX)
  if (nostrMatch && nostrMatch[1]) {
    const id = nostrMatch[1]
    try {
      if (id.length === 64 && /^[a-f0-9]{64}$/i.test(id)) {
        // Raw hex (assumed event ID for origin, but could be pubkey)
        // Usually, users paste hex for event IDs in this context
        tags.push(['e', id])
        return tags
      }

      const decoded = decodeNip19(id)
      if (!decoded) {
        return null
      }
      switch (decoded.type) {
        case 'npub':
          tags.push(['p', decoded.data])
          break
        case 'nprofile':
          tags.push(['p', decoded.data.pubkey])
          if (decoded.data.relays?.[0]) {
            tags[0].push(decoded.data.relays[0])
          }
          break
        case 'note':
          tags.push(['e', decoded.data])
          break
        case 'nevent':
          tags.push(['e', decoded.data.id])
          if (decoded.data.relays?.[0]) {
            tags[0].push(decoded.data.relays[0])
          }
          break
        case 'naddr':
          tags.push(['a', `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`])
          if (decoded.data.relays?.[0]) {
            tags[0].push(decoded.data.relays[0])
          }
          break
      }

      if (tags.length > 0) {
        return tags
      }
    } catch {
      // Not a valid Nostr identifier, continue to generic URL check
    }
  }

  // Generic URL check
  if (URL_REGEX.test(trimmed)) {
    tags.push(['r', trimmed])
    return tags
  }

  return null
}
