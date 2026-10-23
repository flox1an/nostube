import { AccountManager } from 'applesauce-accounts'
import { instanceSignerName, instanceSignerRelays } from '@nostube/core/instance-config'
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

/** Instance metadata and rendezvous relays passed to the shared Nostr login dialog. */
export interface LoginConnection {
  clientName: string
  relays: string[]
}

let loaded: Promise<LoginConnection> | undefined

/**
 * Restores the stored accounts once, after the instance client has set up the NIP-46 transport.
 * Resolves to the instance-specific name and rendezvous relays of a new Nostr Connect pairing.
 */
export function loadAccounts(): Promise<LoginConnection> {
  loaded ??= bootInstanceClient().then(async ({ config }) => {
    await restoreAccountsToManager(accountManager)
    return { clientName: instanceSignerName(config), relays: instanceSignerRelays(config) }
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
