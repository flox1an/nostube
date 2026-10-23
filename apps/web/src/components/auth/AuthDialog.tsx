// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import { useMemo } from 'react'
import {
  getInstanceConfig,
  instanceSignerName,
  instanceSignerRelays,
} from '@nostube/core/instance-config'
import {
  AuthDialog as SharedAuthDialog,
  type AuthDialogProps,
} from '@nostube/widgets/components/auth/AuthDialog'
import { DEFAULT_RELAYS } from '@/nostr/core'
import { markNewUser } from '@/lib/onboarding-progress'

type WebAuthDialogProps = Omit<AuthDialogProps, 'relays' | 'onComplete'> & { relays?: string[] }

/**
 * The shared auth dialog with the web app's own signup completion behavior: mark the
 * onboarding wizard as skippable for new accounts. The NIP-46 handshake runs on the app's
 * default relays, or on the instance's dedicated rendezvous relays in an instance build.
 */
export function AuthDialog({ relays, clientName, ...props }: WebAuthDialogProps) {
  const instance = getInstanceConfig()
  const pairingRelays = useMemo(
    () => relays ?? (instance ? instanceSignerRelays(instance) : DEFAULT_RELAYS),
    [relays, instance]
  )
  return (
    <SharedAuthDialog
      {...props}
      clientName={clientName ?? (instance ? instanceSignerName(instance) : undefined)}
      relays={pairingRelays}
      onComplete={markNewUser}
    />
  )
}

export default AuthDialog
