/**
 * Blossom server information and utilities for onboarding
 */

export interface BlossomServerInfo {
  url: string
  name: string
  status: 'ok' | 'warning' | 'error' | 'todo'
  cdnProvider?: string
  supportsMirror: boolean
  maxFileSize?: string
  retention?: string
  payment: 'free' | 'paid'
  price?: string
  notes?: string
}

/**
 * Recommended Blossom servers for onboarding
 * Excludes blocked servers (cdn.nostrcheck.me, nostr.download)
 */
export const RECOMMENDED_BLOSSOM_SERVERS: BlossomServerInfo[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'almond.slidestr.net',
    status: 'ok',
    supportsMirror: true,
    payment: 'free',
    notes: 'Supports chunked upload',
  },
  {
    url: 'https://blossom.primal.net',
    name: 'blossom.primal.net',
    status: 'ok',
    cdnProvider: 'Bunny Net',
    supportsMirror: false,
    payment: 'free',
  },
  {
    url: 'https://24242.io',
    name: '24242.io',
    status: 'ok',
    cdnProvider: 'BunnyCDN',
    supportsMirror: false,
    maxFileSize: '100MB',
    retention: '60 days',
    payment: 'free',
  },
  {
    url: 'https://blossom.band',
    name: 'blossom.band',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment',
  },
  {
    url: 'https://blossom.sector01.com',
    name: 'blossom.sector01.com',
    status: 'ok',
    supportsMirror: false,
    payment: 'free',
  },
  {
    url: 'https://cdn.satellite.earth',
    name: 'cdn.satellite.earth',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment',
  },
]

/**
 * Default upload servers for new users
 */
export const DEFAULT_UPLOAD_SERVERS = ['https://almond.slidestr.net']

/**
 * Default mirror servers for new users
 */
export const DEFAULT_MIRROR_SERVERS = ['https://blossom.primal.net', 'https://24242.io']

/**
 * Derive a display name from a server URL
 */
export function deriveServerName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
