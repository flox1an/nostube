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
  payment: 'free' | 'paid' | 'freemium'
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
    cdnProvider: 'Bunny Net',
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
    url: 'https://cdn.satellite.earth',
    name: 'cdn.satellite.earth',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment',
  },
  {
    url: 'https://nostr.download',
    name: 'nostr.download',
    status: 'ok',
    supportsMirror: true,
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://blossom-01.uid.ovh',
    name: 'blossom-01.uid.ovh',
    supportsMirror: true,
    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://blossom-02.uid.ovh',
    name: 'blossom-02.uid.ovh',
    supportsMirror: true,

    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://blossom.yakihonne.com',
    name: 'blossom.yakihonne.com',
    supportsMirror: true,
    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://loratu.bitcointxoko.com',
    name: 'loratu.bitcointxoko.com',
    supportsMirror: true,
    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://nostrmedia.com',
    name: 'nostrmedia.com',
    supportsMirror: true,
    status: 'ok',
    payment: 'paid',
    notes: 'Subscriptions at https://nostrmedia.com/#plan',
    price: 'from $2.99/month',
  },
]

/**
 * Default upload servers for new users
 */
export const DEFAULT_UPLOAD_SERVERS = ['https://almond1.b-cdn.net']

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
