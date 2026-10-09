import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import type { AdminConfig } from './api'
import { isKeyConnected } from './draft'
import { useSigner } from './signer-context'

/**
 * A new instance has no creator and no allowed writer, so nobody can publish. This offers the
 * one step that changes that: make the key of the browser's signer the creator and writer.
 */
export function ConnectKey({
  config,
  onConnected,
  busy,
}: {
  config: AdminConfig
  /** Saves the config with this key added; the server restarts. */
  onConnected: (pubkey: string) => Promise<void>
  busy: boolean
}) {
  const { status, pubkey, connect } = useSigner()
  const [error, setError] = useState<string | null>(null)

  const needed = config.creators.length === 0 || config.allowedWriters.length === 0
  if (!needed && (pubkey === null || isKeyConnected(config, pubkey))) return null

  const connectNow = async () => {
    setError(null)
    try {
      await onConnected(await connect())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Alert>
      <AlertTitle>
        {needed ? 'Connect your Nostr key to publish' : 'This key is not a creator of the instance'}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {needed
            ? 'The instance has no creator and no one allowed to upload yet. Connect the key of your Nostr signer to become both.'
            : 'The key of your signer is not yet a creator and uploader here. Add it to publish with it.'}
        </p>
        {status === 'none' && (
          <p>
            No Nostr signer was found in this browser. Install a NIP-07 extension (nos2x, Alby, …)
            and reload this page.
          </p>
        )}
        {error && <p className="text-destructive">{error}</p>}
        <Button type="button" onClick={connectNow} disabled={status !== 'ready' || busy}>
          {busy ? 'Saving…' : 'Connect my key'}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
