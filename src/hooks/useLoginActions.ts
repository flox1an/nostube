import { useContext } from 'react';
import { AccountsContext } from 'applesauce-react';
import { ExtensionAccount } from 'applesauce-accounts/accounts';
import { ExtensionSigner } from 'applesauce-signers';

// NOTE: This file should not be edited except for adding new login methods.

export function useLoginActions() {
  const accountManager = useContext(AccountsContext);

  if (!accountManager) {
    throw new Error('useLoginActions must be used within AccountsProvider');
  }

  return {
    // Login with a Nostr secret key
    async nsec(_nsec: string): Promise<void> {
      // TODO: Implement nsec login with applesauce
      console.warn('nsec login not yet implemented for applesauce migration');
      throw new Error('nsec login not yet implemented');
    },
    // Login with a NIP-46 "bunker://" URI
    async bunker(_uri: string): Promise<void> {
      // TODO: Implement bunker login with applesauce
      console.warn('bunker login not yet implemented for applesauce migration');
      throw new Error('bunker login not yet implemented');
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
      // TODO: Implement logout with applesauce
      console.warn('logout not yet implemented for applesauce migration');
      throw new Error('logout not yet implemented');
    },
  };
}
