// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

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
 * default relays.
 */
export function AuthDialog({ relays = DEFAULT_RELAYS, ...props }: WebAuthDialogProps) {
  return <SharedAuthDialog {...props} relays={relays} onComplete={markNewUser} />
}

export default AuthDialog
