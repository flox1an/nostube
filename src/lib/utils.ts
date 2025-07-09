import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import langs from 'langs';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Takes a string[][] of relays sets and normalizes the url and return a unique list of relays
 */
export function mergeRelays(relaySets: string[][]): string[] {
  const normalizedRelays = new Set<string>();

  const normalizeRelayUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    if (trimmed.includes('://')) {
      return trimmed;
    }

    return `wss://${trimmed}`;
  };

  for (const set of relaySets) {
    for (const relayUrl of set) {
      normalizedRelays.add(normalizeRelayUrl(relayUrl));
    }
  }

  return Array.from(normalizedRelays);
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function nowInSecs() {
  return Math.floor(Date.now() / 1000);
}

export const formatBlobUrl = (url: string) => {
  return url.replace('https://', '').replace('http://', '').replace(/\/.*$/, '');
};

export function buildAdvancedMimeType(baseMimetype: string, videoCodec?: string, audioCodec?: string): string {
  // If baseMimetype already contains a codecs parameter, return as is
  if (/codecs\s*=/.test(baseMimetype)) {
    return baseMimetype;
  }

  const codecs: string[] = [];

  if (videoCodec) {
    codecs.push(videoCodec);
  }
  if (audioCodec) {
    codecs.push(audioCodec);
  }

  if (codecs.length === 0) {
    // Remove any trailing semicolons or whitespace
    return baseMimetype.replace(/;\s*$/, '').trim();
  }

  const codecParam = `codecs="${codecs.join(',')}"`;
  // Ensure no trailing semicolon before appending
  const cleanBase = baseMimetype.replace(/;\s*$/, '').trim();
  return `${cleanBase}; ${codecParam}`;
}

/**
 * Maps a BCP-47/ISO language code (e.g. 'en', 'en-US', 'fr', 'de-DE') to a human-readable language name.
 * Falls back to the code itself if not found.
 * Examples:
 *   'en' => 'English'
 *   'en-US' => 'English (United States)'
 *   'fr' => 'French'
 *   'de-DE' => 'German (Germany)'
 */
export function getLanguageLabel(lang: string): string {
  if (!lang) return '';
  // Split language and region
  const [language, region] = lang.split(/[-_]/);
  const entry =
    langs.where('1', language) ||
    langs.where('2', language) ||
    langs.where('2T', language) ||
    langs.where('2B', language) ||
    langs.where('3', language);
  if (!entry) return lang;
  let label = entry.name;
  if (region) {
    // Try to get region name (e.g. 'US' => 'United States')
    // Use Intl.DisplayNames if available
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
        const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(region.toUpperCase());
        if (regionName && regionName !== region.toUpperCase()) {
          label += ` (${regionName})`;
        } else {
          label += ` (${region.toUpperCase()})`;
        }
      } else {
        label += ` (${region.toUpperCase()})`;
      }
    } catch {
      label += ` (${region.toUpperCase()})`;
    }
  }
  return label;
}

export const imageProxy = (url?: string) => {
  return `https://images.slidestr.net/insecure/f:webp/rs:fill:80:80/plain/${url}`;
};
export const imageProxyVideoPreview = (url?: string) => {
  return `https://images.slidestr.net/insecure/f:webp/rs:fill:320:320/plain/${url}`;
};
