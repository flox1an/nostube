import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountsProvider } from 'applesauce-react/providers'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import LoginDialog from '@nostube/widgets/components/auth/LoginDialog'
import { accountManager, loadAccounts } from './accounts'
import { logIn, nostrPost } from './api'
import { Field } from './fields'

/**
 * The studio's login: the admin password, or a bound Nostr key through the same login dialog as
 * the site (extension, nsec, bunker, Nostr Connect). The account stays logged in in this browser
 * and signs in own identity. The server's `/admin/login` page stays as the fallback.
 */
export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const [relays, setRelays] = useState<string[]>([])

  useEffect(() => {
    // The NIP-46 transport and the pairing relays; without them the other methods still work.
    loadAccounts().then(setRelays, () => {})
  }, [])

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
      onLoggedIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(() => logIn(password))
  }

  const withNostr = () => {
    const account = accountManager.active
    if (account) void run(() => nostrPost('/admin/login/nostr', account))
  }

  return (
    <AccountsProvider manager={accountManager}>
      <div className="mx-auto max-w-sm space-y-4 py-12">
        <h2 className="text-lg font-medium">{t('studio.login.title')}</h2>
        <form onSubmit={submit} className="space-y-3">
          <Field id="login-password" label={t('studio.login.password')}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {t('studio.login.submit')}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">{t('studio.login.or')}</p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => setDialog(true)}
        >
          {t('studio.login.withNostr')}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('studio.login.forgot')}</p>
      </div>
      <LoginDialog
        isOpen={dialog}
        relays={relays}
        onLogin={withNostr}
        onClose={() => setDialog(false)}
      />
    </AccountsProvider>
  )
}
