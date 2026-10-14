import { vi, type Mock } from 'vitest'
import { ExtensionAccount } from 'applesauce-accounts/accounts'
import { ExtensionSigner } from 'applesauce-signers'
import { finalizeEvent, getPublicKey, type EventTemplate, type NostrEvent } from 'nostr-tools'
import { accountManager } from './accounts'

type NostrWindow = { nostr?: object }

/** A stand-in NIP-07 extension; its methods are mocks to assert on. */
export interface TestExtension {
  getPublicKey: Mock<() => Promise<string>>
  signEvent: Mock<(template: EventTemplate) => Promise<NostrEvent>>
}

/** A NIP-07 extension holding `secret` (jsdom has none). */
export function installExtension(secret: Uint8Array): TestExtension {
  const extension: TestExtension = {
    getPublicKey: vi.fn(async () => getPublicKey(secret)),
    // A plain copy: nostr-tools marks the object it verified.
    signEvent: vi.fn(
      async (template: EventTemplate) =>
        JSON.parse(JSON.stringify(finalizeEvent(template, secret))) as NostrEvent
    ),
  }
  ;(window as NostrWindow).nostr = extension
  return extension
}

/** Logged in with that extension in this browser, as the login dialog leaves it. */
export function logInWithExtension(secret: Uint8Array): TestExtension {
  const extension = installExtension(secret)
  const account = new ExtensionAccount(getPublicKey(secret), new ExtensionSigner())
  accountManager.addAccount(account)
  accountManager.setActive(account)
  return extension
}

export function logOut() {
  accountManager.clearActive()
  delete (window as NostrWindow).nostr
}
