import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
        {needed ? t('studio.connect.neededTitle') : t('studio.connect.notCreatorTitle')}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{needed ? t('studio.connect.neededBody') : t('studio.connect.notCreatorBody')}</p>
        {status === 'none' && <p>{t('studio.connect.noSigner')}</p>}
        {error && <p className="text-destructive">{error}</p>}
        <Button type="button" onClick={connectNow} disabled={status !== 'ready' || busy}>
          {busy ? t('studio.app.saving') : t('studio.connect.connect')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
