import { invoke, isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { generateSecretKey, nip19 } from 'nostr-tools'
import { useState } from 'react'

const closeAuthWindow = () => {
  if (isTauri()) {
    void getCurrentWindow().close()
  }
}

export function DesktopAuthPage() {
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const saveCredential = async (value: string) => {
    setIsSaving(true)
    setError(null)
    try {
      await invoke('desktop_import_credential', {
        credential: value.trim(),
        password: password || undefined,
      })
      setCredential('')
      setPassword('')
      closeAuthWindow()
    } catch (reason) {
      setError(
        typeof reason === 'string'
          ? reason
          : reason instanceof Error
            ? reason.message
            : 'Could not unlock this desktop account'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <section className="mx-auto max-w-lg space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Add desktop account</h1>
          <p className="text-sm text-muted-foreground">
            Your credential is protected by macOS Keychain and never saved in this Webview.
          </p>
        </div>
        <div className="space-y-3">
          <Input
            aria-label="Nostr credential"
            autoComplete="off"
            onChange={event => setCredential(event.target.value)}
            placeholder="nsec1... or ncryptsec1..."
            type="password"
            value={credential}
          />
          {credential.startsWith('ncryptsec1') && (
            <Input
              aria-label="Encrypted credential password"
              autoComplete="off"
              onChange={event => setPassword(event.target.value)}
              placeholder="Encrypted credential password"
              type="password"
              value={password}
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!credential.trim() || isSaving}
            onClick={() => saveCredential(credential)}
          >
            {isSaving ? 'Saving account…' : 'Import account'}
          </Button>
        </div>
        <div className="border-t pt-6">
          <Button
            className="w-full"
            disabled={isSaving}
            onClick={() => {
              const generated = nip19.nsecEncode(generateSecretKey())
              setCredential(generated)
            }}
            variant="outline"
          >
            Create new account
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Save the generated nsec in your password manager before importing it.
          </p>
        </div>
        <Button className="w-full" onClick={closeAuthWindow} variant="ghost">
          Cancel
        </Button>
      </section>
    </main>
  )
}
