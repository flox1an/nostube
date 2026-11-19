import { NostrConnectSigner } from 'applesauce-signers'
import { getInstanceConfig, isBrandingUrl } from './instance-config'

/** How a remote signer app (Amber, nsec.app, ...) labels this client (NIP-46 client metadata). */
export interface NostrConnectClient {
  name: string
  url: string
  image: string
}

/**
 * This client as signer apps show it: the given name (an instance passes its own) or nostube,
 * the current origin and its touch icon (an instance's uploaded icon, like its home-screen icon).
 * Unauthenticated display hints, nothing more.
 */
export function nostrConnectClient(name = 'nostube'): NostrConnectClient {
  const origin = window.location.origin
  const icon = getInstanceConfig()?.site?.icon
  const path = isBrandingUrl('icon', icon) ? icon : '/apple-touch-icon.png'
  return { name, url: origin, image: new URL(path, origin).toString() }
}

/** `NostrConnectSigner.fromBunkerURI` that tells the remote signer who is connecting. */
export function connectBunker(
  uri: string,
  client: NostrConnectClient,
  options?: { onAuth?: (url: string) => Promise<void> }
): Promise<NostrConnectSigner> {
  return NostrConnectSigner.fromBunkerURI(uri, { ...options, metadata: client })
}
