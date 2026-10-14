import { AccountManager } from 'applesauce-accounts'
import {
  restoreAccountsToManager,
  saveActiveAccount,
} from '@nostube/widgets/hooks/useAccountPersistence'
import { bootInstanceClient } from './instance-client'

/**
 * The Nostr accounts of this browser (extension, nsec, bunker, Nostr Connect), stored like the
 * site's (same origin, same storage): logging in on one is logging in on the other.
 */
export const accountManager = new AccountManager()

let loaded: Promise<string[]> | undefined

/**
 * Restores the stored accounts once, after the instance client has set up the NIP-46 transport.
 * Resolves to the relays a new Nostr Connect pairing runs on (the instance's interaction relays).
 */
export function loadAccounts(): Promise<string[]> {
  loaded ??= bootInstanceClient().then(async ({ config }) => {
    await restoreAccountsToManager(accountManager)
    return config.interactionRelays
  })
  // A failed boot may be retried; do not cache the failure.
  loaded.catch(() => {
    loaded = undefined
  })
  return loaded
}

/** Logging out of the studio also stops signing with the Nostr account in this browser. */
export function forgetActiveAccount(): void {
  accountManager.clearActive()
  saveActiveAccount(null)
}
