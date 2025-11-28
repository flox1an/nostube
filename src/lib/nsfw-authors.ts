/**
 * NSFW authors configuration
 * Contains pubkeys of authors whose videos should be marked as NSFW
 */

export const NSFW_AUTHORS = [
  'e7fa9dd5b19fb96ff882456e99dd32e2fd59937409e398b75efc65a5131a2400', // npub1ulafm4d3n7ukl7yzg4hfnhfjut74nym5p83e3d67l3j62yc6ysqqrancw2
  'f8f6b6f741bd422346579304550de64a6445fd332c50389e9a1f4d8294a101e0', // npub1lrmtda6ph4pzx3jhjvz92r0xffjytlfkpffggpuqwqgya9
]

/**
 * Check if a pubkey belongs to an NSFW author
 */
export function isNSFWAuthor(pubkey?: string): boolean {
  if (!pubkey) return false
  return NSFW_AUTHORS.includes(pubkey)
}
