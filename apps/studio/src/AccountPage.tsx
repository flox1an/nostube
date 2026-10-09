import { useState } from 'react'
import { Alert, AlertDescription } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { logout, nip07, nostrPost, unbindNostr, type AdminState } from './api'

/** Who can log in: the password always, optionally the key of a NIP-07 signer. */
export function AccountPage({ state, reload }: { state: AdminState; reload: () => void }) {
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
          <CardTitle>Login with a Nostr key</CardTitle>
          <CardDescription>
            Your password always works. A bound NIP-07 key lets you log in with your signer too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {state.nostrPubkey ? (
              <>
                Bound key: <code className="break-all">{state.nostrPubkey}</code>
              </>
            ) : (
              'No key is bound.'
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {nip07() && (
              <Button
                type="button"
                variant="outline"
                onClick={() => run(() => nostrPost('/admin/bind-nostr'))}
              >
                Bind this browser&apos;s key
              </Button>
            )}
            {state.nostrPubkey && (
              <Button type="button" variant="outline" onClick={() => run(unbindNostr)}>
                Unbind
              </Button>
            )}
            {!nip07() && !state.nostrPubkey && (
              <p className="text-sm text-muted-foreground">
                Install a NIP-07 signer extension to bind a key.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>This device</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <a href="/ca.pem">Download the instance CA</a>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await logout()
              location.href = '/admin/login'
            }}
          >
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
