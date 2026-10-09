import type { InstanceConfig } from '@nostube/core/instance-config'

/**
 * Embed URL parameters configuration
 */
export interface EmbedParams {
  videoId: string
  autoplay: boolean
  muted: boolean
  loop: boolean
  startTime: number
  controls: boolean
  showTitle: boolean
  showBranding: boolean
  showZaps: boolean
  preferredQuality: string
  customRelays: string[]
  accentColor: string
  /** The config of the instance serving this embed, once read; null on nostube. */
  instance: InstanceConfig | null
}

/**
 * Parse URL query parameters into config object
 */
export function parseURLParams(): EmbedParams {
  const params = new URLSearchParams(window.location.search)

  return {
    videoId: params.get('v') || '',
    autoplay: params.get('autoplay') === '1',
    muted: params.get('muted') === '1',
    loop: params.get('loop') === '1',
    startTime: parseInt(params.get('t') || '0', 10),
    controls: params.get('controls') !== '0',
    showTitle: params.get('title') !== '0',
    showBranding: params.get('branding') !== '0',
    showZaps: params.get('zaps') !== '0',
    preferredQuality: params.get('quality') || 'auto',
    customRelays: params.get('relays')
      ? params
          .get('relays')!
          .split(',')
          .map(r => r.trim())
      : [],
    accentColor: params.get('color') || '8b5cf6',
    instance: null,
  }
}

/**
 * Validate required parameters
 */
export function validateParams(config: EmbedParams): { valid: boolean; error?: string } {
  if (!config.videoId) {
    return { valid: false, error: 'Missing required parameter: v (video ID)' }
  }

  if (
    !config.videoId.startsWith('nevent1') &&
    !config.videoId.startsWith('naddr1') &&
    !config.videoId.startsWith('note1')
  ) {
    return {
      valid: false,
      error: 'Invalid video ID format. Must be nevent1..., naddr1..., or note1...',
    }
  }

  return { valid: true }
}
