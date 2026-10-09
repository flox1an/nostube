import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { nip07, nostrPost, unbindNostr, type AdminState } from './api'

/** Who can log in: the password always, optionally the key of a NIP-07 signer. */
export function AccountPage({ state, reload }: { state: AdminState; reload: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('studio.account.title')}</CardTitle>
          <CardDescription>{t('studio.account.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {state.nostrPubkey ? (
              <>
                {t('studio.account.boundKey')}{' '}
                <code className="break-all">{state.nostrPubkey}</code>
              </>
            ) : (
              t('studio.account.noKey')
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {nip07() && (
              <Button
                type="button"
                variant="outline"
                onClick={() => run(() => nostrPost('/admin/bind-nostr'))}
              >
                {t('studio.account.bind')}
              </Button>
            )}
            {state.nostrPubkey && (
              <Button type="button" variant="outline" onClick={() => run(unbindNostr)}>
                {t('studio.account.unbind')}
              </Button>
            )}
            {!nip07() && !state.nostrPubkey && (
              <p className="text-sm text-muted-foreground">{t('studio.account.installSigner')}</p>
            )}
          </div>
        </CardContent>
      </Card>
      {/* Only an instance with its own CA has one to install; behind a proxy TLS is public. */}
      {state.tlsMode === 'local-ca' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('studio.account.deviceTitle')}</CardTitle>
            <CardDescription>{t('studio.account.deviceDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/ca.pem">{t('studio.account.downloadCa')}</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
