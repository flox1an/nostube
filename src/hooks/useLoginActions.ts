import { useContext } from 'react';
import { AccountsContext } from 'applesauce-react';
import { ExtensionAccount, NostrConnectAccount, SimpleAccount } from 'applesauce-accounts/accounts';
import { ExtensionSigner, NostrConnectSigner, SimpleSigner } from 'applesauce-signers';
import { nip19 } from 'nostr-tools';

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const accountManager = useContext(AccountsContext);

  if (!accountManager) {
    throw new Error('useLoginActions must be used within AccountsProvider');
  }

  return {
    // Login with a Nostr secret key
    async nsec(_nsec: string): Promise<void> {
      const signer = SimpleSigner.fromKey(nip19.decode(_nsec).data as string);
      const pubkey = await signer.getPublicKey();
      const account = new SimpleAccount(pubkey, signer);
      accountManager.addAccount(account);
      accountManager.setActive(account);
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(_uri: string): Promise<void> {
      const signer = new NostrConnectSigner({
        relays: ['wss://bunker.nostr.land'],
      });
      const pubkey = await signer.getPublicKey();
      const account = new NostrConnectAccount(pubkey, signer);
      accountManager.addAccount(account);
      accountManager.setActive(account);
    },
    // Login with a NIP-07 browser extension
    async extension(): Promise<void> {
      const signer = new ExtensionSigner();
      const pubkey = await signer.getPublicKey();
      const account = new ExtensionAccount(pubkey, signer);
      accountManager.addAccount(account);
      accountManager.setActive(account);
    },
    async logout(): Promise<void> {
      accountManager.clearActive();
    },
  };
}
