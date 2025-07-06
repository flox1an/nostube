import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
