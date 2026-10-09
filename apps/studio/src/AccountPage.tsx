import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19 } from 'nostr-tools'
import { Alert, AlertDescription } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { exportNsec, nip07, nostrPost, unbindNostr, type AdminState } from './api'
import { Field } from './fields'
import { useSigner } from './signer-context'

/** Where the creator's key lives; in managed mode the way to take it along (the nsec export). */
function SigningKeyCard() {
  const { t } = useTranslation()
  const { mode, pubkey, error: signerError } = useSigner()
  const [password, setPassword] = useState('')
  const [nsec, setNsec] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const exportKey = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      setNsec(await exportNsec(password))
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studio.account.signerTitle')}</CardTitle>
        {mode && <CardDescription>{t(`studio.account.signerModes.${mode}`)}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {signerError && <p className="text-sm text-destructive">{signerError}</p>}
        {pubkey && (
          <p className="text-sm">
            {t('studio.account.signerKey')}{' '}
            <code className="break-all">{nip19.npubEncode(pubkey)}</code>
          </p>
        )}
        {mode === 'managed' &&
          (nsec ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{t('studio.account.nsecWarning')}</p>
              <code className="block break-all rounded-md bg-muted p-2 text-sm">{nsec}</code>
              <Button type="button" variant="outline" onClick={() => setNsec(null)}>
                {t('studio.account.hideNsec')}
              </Button>
            </div>
          ) : (
            <form onSubmit={exportKey} className="space-y-3">
              <Field
                id="export-password"
                label={t('studio.account.exportPassword')}
                hint={t('studio.account.exportHint')}
              >
                <Input
                  id="export-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" variant="outline" disabled={busy || !password}>
                {t('studio.account.exportNsec')}
              </Button>
            </form>
          ))}
      </CardContent>
    </Card>
  )
}

/** Who signs (the signing key) and who can log in: the password always, optionally a NIP-07 key. */
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
      <SigningKeyCard />
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
