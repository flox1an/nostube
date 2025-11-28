/**
 * Beta users configuration
 * Contains pubkeys with access to beta features
 */

export const BETA_USERS = ['b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81']

/**
 * Check if a pubkey is a beta user
 */
export function isBetaUser(pubkey?: string): boolean {
  if (!pubkey) return false
  return BETA_USERS.includes(pubkey)
}
