import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import type { AdminConfig } from './api'
import { isKeyConnected } from './draft'
import { useSigner } from './signer-context'

/**
 * A new instance has no creator and no allowed writer, so nobody can publish. This offers the
 * one step that changes that: make a key the creator and writer. Before any key is set up the
 * owner chooses, with equal weight, between a key the server keeps (managed) and their own.
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
  const { status, mode, pubkey, connect, createManaged, error: signerError } = useSigner()
  const [error, setError] = useState<string | null>(null)

  const needed = config.creators.length === 0 || config.allowedWriters.length === 0
  // Until the server said where the key lives, the choice is unknown.
  if (status === 'loading') return null
  if (!needed && (pubkey === null || isKeyConnected(config, pubkey))) return null
  const choose = needed && mode === 'none'

  const run = (key: () => Promise<string>) => async () => {
    setError(null)
    try {
      await onConnected(await key())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const label = (text: string) => (busy ? t('studio.app.saving') : text)
  const noSigner = status === 'none' && !signerError && (
    <p className="text-sm">{t('studio.connect.noSigner')}</p>
  )

  return (
    <Alert>
      <AlertTitle>
        {choose
          ? t('studio.connect.chooseTitle')
          : needed
            ? t('studio.connect.neededTitle')
            : t('studio.connect.notCreatorTitle')}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {choose
            ? t('studio.connect.chooseBody')
            : needed
              ? t('studio.connect.neededBody')
              : t('studio.connect.notCreatorBody')}
        </p>
        {signerError && <p className="text-destructive">{signerError}</p>}
        {error && <p className="text-destructive">{error}</p>}
        {choose ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="space-y-2 rounded-md border border-border p-3">
              <h3 className="font-medium">{t('studio.connect.managedTitle')}</h3>
              <p className="text-sm">{t('studio.connect.managedBody')}</p>
              <Button type="button" onClick={run(createManaged)} disabled={busy}>
                {label(t('studio.connect.createManaged'))}
              </Button>
            </section>
            <section className="space-y-2 rounded-md border border-border p-3">
              <h3 className="font-medium">{t('studio.connect.ownTitle')}</h3>
              <p className="text-sm">{t('studio.connect.ownBody')}</p>
              {noSigner}
              <Button type="button" onClick={run(connect)} disabled={status !== 'ready' || busy}>
                {label(t('studio.connect.connect'))}
              </Button>
            </section>
          </div>
        ) : (
          <>
            {noSigner}
            <Button type="button" onClick={run(connect)} disabled={status !== 'ready' || busy}>
              {label(t('studio.connect.connect'))}
            </Button>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
