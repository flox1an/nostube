export type MediaUrlTrust = 'event' | 'configured-service'

export type MediaUrlDisposition =
  | 'allowed'
  | 'blocked-invalid'
  | 'blocked-unsupported-scheme'
  | 'blocked-credentials'
  | 'blocked-loopback'
  | 'blocked-private-network'

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return null

  const octets = parts.map(Number)
  return octets.every(octet => octet >= 0 && octet <= 255) ? octets : null
}

function isBlockedIpv4(octets: number[]): MediaUrlDisposition | null {
  const [first, second] = octets

  if (first === 127) return 'blocked-loopback'
  if (first === 10 || first === 0) return 'blocked-private-network'
  if (first === 172 && second >= 16 && second <= 31) return 'blocked-private-network'
  if (first === 192 && second === 168) return 'blocked-private-network'
  if (first === 169 && second === 254) return 'blocked-private-network'
  if (first === 100 && second >= 64 && second <= 127) return 'blocked-private-network'
  if (first >= 224) return 'blocked-private-network'

  return null
}

function classifyIpHostname(hostname: string): MediaUrlDisposition | null {
  const ipv4 = parseIpv4(hostname)
  if (ipv4) return isBlockedIpv4(ipv4)

  const ipv6 = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!ipv6.includes(':')) return null

  if (ipv6 === '::1') return 'blocked-loopback'
  if (ipv6.startsWith('::ffff:')) {
    const mappedIpv4 = parseIpv4(ipv6.slice('::ffff:'.length))
    return mappedIpv4 ? isBlockedIpv4(mappedIpv4) : 'blocked-private-network'
  }
  if (/^(?:fc|fd)[0-9a-f]{0,2}(?::|$)/.test(ipv6)) return 'blocked-private-network'
  if (/^fe[89ab][0-9a-f]?(?::|$)/.test(ipv6)) return 'blocked-private-network'
  if (ipv6 === '::' || ipv6.startsWith('::ffff:0:')) return 'blocked-private-network'

  return null
}

/**
 * Classify a media URL according to where it came from. Event URLs are untrusted
 * network input; configured services are deliberate, local user configuration.
 */
export function classifyMediaUrl(url: string, trust: MediaUrlTrust): MediaUrlDisposition {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'blocked-invalid'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'blocked-unsupported-scheme'
  }
  if (parsed.username || parsed.password) return 'blocked-credentials'
  if (trust === 'configured-service') return 'allowed'

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return 'blocked-loopback'

  return classifyIpHostname(hostname) ?? 'allowed'
}

export function isAllowedEventMediaUrl(url: string): boolean {
  return classifyMediaUrl(url, 'event') === 'allowed'
}

/** User-configured services may intentionally run on the local machine. */
export function isAllowedConfiguredServiceUrl(url: string): boolean {
  return classifyMediaUrl(url, 'configured-service') === 'allowed'
}

/** A hostname sent to a remote proxy must always be publicly routable. */
export function isPublicMediaServerHint(url: string): boolean {
  return isAllowedEventMediaUrl(url)
}
