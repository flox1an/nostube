/**
 * NSFW authors utilities
 *
 * Check if a pubkey belongs to an NSFW author based on the selected preset's nsfwPubkeys list
 */

/**
 * Check if a pubkey belongs to an NSFW author
 * @param pubkey The pubkey to check
 * @param nsfwPubkeys List of NSFW pubkeys from the selected preset
 */
export function isNSFWAuthor(pubkey?: string, nsfwPubkeys: string[] = []): boolean {
  if (!pubkey) return false
  return nsfwPubkeys.includes(pubkey)
}
