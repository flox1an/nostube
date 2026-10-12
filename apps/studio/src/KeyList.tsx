import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { nip19 } from 'nostr-tools'
import { NIP05_REGEX, queryProfile } from 'nostr-tools/nip05'
import { X } from 'lucide-react'
import { Badge } from '@nostube/widgets/components/badge'
import { Button } from '@nostube/widgets/components/button'
import { Input } from '@nostube/widgets/components/input'
import { Label } from '@nostube/widgets/components/label'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useNostubeHostSafe } from '@nostube/widgets/host'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { toHexKey } from './draft'

function shortNpub(hex: string): string {
  const npub = nip19.npubEncode(hex)
  return `${npub.slice(0, 12)}…${npub.slice(-6)}`
}

/** Avatar and name; needs the instance providers around it. */
function Profile({ pubkey }: { pubkey: string }) {
  const profile = useProfile({ pubkey })
  const name = profile?.display_name || profile?.name
  return (
    <>
      <UserAvatar picture={profile?.picture} pubkey={pubkey} name={name} className="h-6 w-6" />
      {name && <span className="truncate font-medium">{name}</span>}
    </>
  )
}

/**
 * A list of keys (one per line in `text`, the draft's format) as chips with a remove button, and
 * an input taking an npub, a hex key or a NIP-05 address. Profiles show once the instance
 * providers are around it; lines that are no key stay visible so the save errors can name them.
 */
export function KeyList({
  id,
  label,
  hint,
  text,
  onChange,
  firstLabel,
}: {
  id: string
  label: string
  hint: ReactNode
  text: string
  onChange: (text: string) => void
  /** A badge for the first entry (the start page). */
  firstLabel?: string
}) {
  const { t } = useTranslation()
  const profiles = useNostubeHostSafe() !== undefined
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const value = input.trim()
    if (!value) return
    setError(null)
    let hex = toHexKey(value)
    if (!hex && NIP05_REGEX.test(value)) {
      setBusy(true)
      hex = (await queryProfile(value).catch(() => null))?.pubkey ?? null
      setBusy(false)
      if (!hex) return setError(t('studio.instance.keys.notFound', { address: value }))
    }
    if (!hex) return setError(t('studio.instance.keys.invalid'))
    if (!lines.some(line => (toHexKey(line) ?? line) === hex)) {
      onChange([...lines, hex].join('\n'))
    }
    setInput('')
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {lines.length > 0 && (
        <ul className="space-y-1.5">
          {lines.map((line, index) => {
            const hex = toHexKey(line)
            return (
              <li
                key={`${index}:${line}`}
                className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
              >
                {hex && profiles && <Profile pubkey={hex} />}
                <code
                  className={`truncate text-xs ${hex ? 'text-muted-foreground' : 'text-destructive'}`}
                >
                  {hex ? shortNpub(hex) : line}
                </code>
                {index === 0 && firstLabel && <Badge variant="secondary">{firstLabel}</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 shrink-0"
                  aria-label={t('studio.instance.keys.remove', {
                    key: hex ? shortNpub(hex) : line,
                  })}
                  onClick={() => onChange(lines.filter((_, i) => i !== index).join('\n'))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={e => void add(e)}>
        <Input
          id={id}
          value={input}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('studio.instance.keys.placeholder')}
          aria-invalid={error !== null}
          onChange={e => {
            setInput(e.target.value)
            setError(null)
          }}
        />
        <Button type="submit" variant="outline" disabled={busy || !input.trim()}>
          {busy ? t('studio.instance.keys.resolving') : t('studio.instance.keys.add')}
        </Button>
      </form>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
