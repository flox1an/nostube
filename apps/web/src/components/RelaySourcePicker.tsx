import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Globe,
  Layers,
  Link2,
  Loader2,
  Plus,
  Settings,
  Wifi,
} from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import { Checkbox } from '@nostube/widgets/components/checkbox'
import { Input } from '@nostube/widgets/components/input'
import { Label } from '@nostube/widgets/components/label'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@nostube/widgets/components/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@nostube/widgets/components/popover'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useAppContext } from '@/hooks/useAppContext'
import { useRelayBrowsing } from '@/contexts/RelayBrowsingContext'
import { genUserName } from '@/lib/genUserName'
import { cn } from '@/lib/utils'
import { decodeRelaySet, relaySource, sourceKey, type BrowseSource } from '@/lib/relay-browsing'

export const BROWSE_SETTINGS_PATH = '/settings/network#browse-sources'

const shortUrl = (url: string) => url.replace(/^wss?:\/\//, '').replace(/\/$/, '')

/** Shared plural defaults: `t('relaySource.relayCount', { count, ...RELAY_COUNT })`. */
// eslint-disable-next-line react-refresh/only-export-components
export const RELAY_COUNT = {
  defaultValue_one: '{{count}} relay',
  defaultValue_other: '{{count}} relays',
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const NADDR = /^(nostr:)?naddr1/i

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Compact feed-source menu: pick a configured, saved or public source, or open a new one. */
export function RelaySourcePicker() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { config } = useAppContext()
  const { source, selectSource, favorites, sets, favoriteRelays, setsLoading, error } =
    useRelayBrowsing()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<
    | { type: 'relay'; initialValue?: string }
    | { type: 'set'; initialValue?: string; preview?: BrowseSource }
    | null
  >(null)

  const readRelays = config.relays.filter(r => r.tags.includes('read'))
  const readUrls = new Set(readRelays.map(r => r.url))
  const publicRelays = favoriteRelays.filter(url => !readUrls.has(url))
  const currentKey = source ? sourceKey(source) : null
  const q = query.trim().toLowerCase()
  const matches = (...values: (string | undefined)[]) =>
    !q || values.some(value => value?.toLowerCase().includes(q))

  const myFeedLabel = t('relaySource.myFeed', { defaultValue: 'My feed' })
  const label = error
    ? t('relaySource.unavailable', { defaultValue: 'Source unavailable' })
    : (source?.title ?? myFeedLabel)

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const choose = (next: BrowseSource | null) => {
    selectSource(next)
    close()
  }
  const chooseUrl = (url: string) => {
    try {
      choose(relaySource(url))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const openDialog = (next: NonNullable<typeof dialog>) => {
    close()
    setDialog(next)
  }

  // Typed input that is not in any list: offer it directly, as the old menu did.
  let typedUrl: string | null = null
  // A dot or port/scheme separator: "dam" alone is a search, not a hostname.
  if (/[.:]/.test(q) && !NADDR.test(q)) {
    try {
      typedUrl = relaySource(query).relays[0]
    } catch {
      typedUrl = null
    }
  }
  const known = new Set([
    ...readUrls,
    ...publicRelays,
    ...favorites.flatMap(f => (f.relays.length === 1 && !f.address ? f.relays : [])),
  ])
  const showTypedUrl = typedUrl !== null && !known.has(typedUrl)

  const shownRead = readRelays.filter(r => matches(r.name, r.url))
  const shownFavorites = favorites.filter(f => matches(f.title, ...f.relays))
  const shownPublic = publicRelays.filter(url => matches(url))
  const shownSets = sets.filter(s => matches(s.title, ...s.relays))
  const showMyFeed = matches(myFeedLabel)

  const itemClass = 'min-h-11 cursor-pointer gap-2'
  const tick = (selected: boolean) => (
    <Check aria-hidden className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
  )
  const text = (title: string, detail?: string) => (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{title}</span>
      {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
  // Config URLs may differ cosmetically from the normalized browse URL (e.g. trailing slash).
  const isCurrentUrl = (url: string) => {
    try {
      return currentKey === sourceKey(relaySource(url))
    } catch {
      return false
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label={t('relaySource.selectorLabel', {
              source: label,
              defaultValue: 'Content source: {{source}}',
            })}
            className={cn(
              'relative h-10 shrink-0 rounded-full px-3 gap-1.5 border-border/80 bg-card shadow-none after:absolute after:inset-x-0 after:-inset-y-0.5',
              error && 'border-destructive/60 text-destructive'
            )}
          >
            {error ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : !source ? (
              <Globe className="h-3.5 w-3.5" />
            ) : source.address || source.relays.length > 1 ? (
              <Layers className="h-3.5 w-3.5" />
            ) : (
              <Wifi className="h-3.5 w-3.5" />
            )}
            {/* The default feed collapses to its icon on mobile; a chosen source stays named. */}
            <span
              className={cn(
                'max-w-24 truncate sm:max-w-32',
                !source && !error && 'hidden sm:inline'
              )}
            >
              {label}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              aria-label={t('relaySource.searchLabel', { defaultValue: 'Search sources' })}
              placeholder={t('relaySource.searchPlaceholder')}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[min(420px,60dvh)]">
              {showMyFeed && (
                <CommandGroup>
                  <CommandItem
                    value="feed:mine"
                    onSelect={() => choose(null)}
                    className={itemClass}
                  >
                    {tick(!source && !error)}
                    <Globe className="h-4 w-4 shrink-0" />
                    {text(
                      myFeedLabel,
                      t('relaySource.myFeedDescription', {
                        count: readRelays.length,
                        defaultValue: 'All your read relays ({{count}})',
                      })
                    )}
                  </CommandItem>
                </CommandGroup>
              )}

              {showTypedUrl && typedUrl && (
                <CommandGroup>
                  <CommandItem
                    value={`typed:${typedUrl}`}
                    onSelect={() => chooseUrl(typedUrl)}
                    className={itemClass}
                  >
                    <span className="h-4 w-4 shrink-0" />
                    <Wifi className="h-4 w-4 shrink-0" />
                    {text(
                      t('relaySource.openTyped', { defaultValue: 'Open this relay' }),
                      typedUrl
                    )}
                  </CommandItem>
                </CommandGroup>
              )}

              {shownRead.length > 0 && (
                <CommandGroup
                  heading={t('relaySource.readRelaysHeading', { defaultValue: 'Your read relays' })}
                >
                  {shownRead.map(relay => (
                    <CommandItem
                      key={relay.url}
                      value={`read:${relay.url}`}
                      onSelect={() => chooseUrl(relay.url)}
                      className={itemClass}
                    >
                      {tick(isCurrentUrl(relay.url))}
                      <Wifi className="h-4 w-4 shrink-0" />
                      {text(relay.name || shortUrl(relay.url), relay.url)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {shownFavorites.length > 0 && (
                <CommandGroup
                  heading={t('relaySource.savedHeading', { defaultValue: 'Saved on this device' })}
                >
                  {shownFavorites.map(favorite => {
                    const key = sourceKey(favorite)
                    return (
                      <CommandItem
                        key={key}
                        value={`saved:${key}`}
                        // Saved sets may have changed since saving: look up and preview first.
                        onSelect={() =>
                          favorite.address
                            ? openDialog({ type: 'set', initialValue: favorite.address })
                            : choose(favorite)
                        }
                        className={itemClass}
                      >
                        {tick(currentKey === key)}
                        {favorite.address || favorite.relays.length > 1 ? (
                          <Layers className="h-4 w-4 shrink-0" />
                        ) : (
                          <Wifi className="h-4 w-4 shrink-0" />
                        )}
                        {text(
                          favorite.title,
                          favorite.relays.length === 1
                            ? favorite.relays[0]
                            : t('relaySource.relayCount', {
                                count: favorite.relays.length,
                                ...RELAY_COUNT,
                              })
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {shownPublic.length > 0 && (
                <CommandGroup
                  heading={t('relaySource.publicFavoritesHeading', {
                    defaultValue: 'Favourite relays (Nostr list)',
                  })}
                >
                  {shownPublic.map(url => (
                    <CommandItem
                      key={url}
                      value={`public:${url}`}
                      onSelect={() => chooseUrl(url)}
                      className={itemClass}
                    >
                      {tick(isCurrentUrl(url))}
                      <Wifi className="h-4 w-4 shrink-0" />
                      {text(shortUrl(url), url)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {(shownSets.length > 0 || setsLoading) && (
                <CommandGroup
                  heading={t('relaySource.setsHeading', { defaultValue: 'Relay sets' })}
                >
                  {shownSets.map(set => {
                    const key = sourceKey(set)
                    return (
                      <CommandItem
                        key={key}
                        value={`set:${key}`}
                        // Preview members before connecting, like a pasted set.
                        onSelect={() => openDialog({ type: 'set', preview: set })}
                        className={itemClass}
                      >
                        {tick(currentKey === key)}
                        <Layers className="h-4 w-4 shrink-0" />
                        {text(
                          set.title,
                          t('relaySource.relayCount', { count: set.relays.length, ...RELAY_COUNT })
                        )}
                      </CommandItem>
                    )
                  })}
                  {setsLoading && (
                    <div
                      role="status"
                      className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted-foreground"
                    >
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      {t('relaySource.setsLoading', { defaultValue: 'Loading your relay lists…' })}
                    </div>
                  )}
                </CommandGroup>
              )}

              {q &&
                !showMyFeed &&
                !showTypedUrl &&
                !shownRead.length &&
                !shownFavorites.length &&
                !shownPublic.length &&
                !shownSets.length && (
                  <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                    {NADDR.test(q)
                      ? t('relaySource.naddrHint', {
                          defaultValue: 'Looks like a relay set. Preview it below.',
                        })
                      : t('relaySource.noResults')}
                  </p>
                )}

              {/* Actions stay visible whatever the search says. */}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="action:add-relay"
                  onSelect={() =>
                    openDialog({ type: 'relay', initialValue: NADDR.test(q) ? '' : query.trim() })
                  }
                  className={itemClass}
                >
                  <span className="h-4 w-4 shrink-0" />
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>{t('relaySource.addRelay', { defaultValue: 'Add relay…' })}</span>
                </CommandItem>
                <CommandItem
                  value="action:open-set"
                  onSelect={() =>
                    openDialog({ type: 'set', initialValue: NADDR.test(q) ? query.trim() : '' })
                  }
                  className={itemClass}
                >
                  <span className="h-4 w-4 shrink-0" />
                  <Link2 className="h-4 w-4 shrink-0" />
                  <span>{t('relaySource.openSet', { defaultValue: 'Open relay set…' })}</span>
                </CommandItem>
                <CommandItem
                  value="action:settings"
                  onSelect={() => {
                    close()
                    navigate(BROWSE_SETTINGS_PATH)
                  }}
                  className={itemClass}
                >
                  <span className="h-4 w-4 shrink-0" />
                  <Settings className="h-4 w-4 shrink-0" />
                  <span>
                    {t('relaySource.manageInSettings', { defaultValue: 'Manage in Settings' })}
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AddRelayDialog
        open={dialog?.type === 'relay'}
        onOpenChange={next => !next && setDialog(null)}
        initialValue={dialog?.initialValue}
      />
      <OpenRelaySetDialog
        open={dialog?.type === 'set'}
        onOpenChange={next => !next && setDialog(null)}
        initialValue={dialog?.initialValue}
        preview={dialog?.type === 'set' ? dialog.preview : undefined}
      />
    </>
  )
}

function SaveLocallyField({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      {/* The label row is the 44px hit area; the box itself stays the standard size. */}
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={value => onCheckedChange(value === true)}
        aria-describedby={`${id}-hint`}
        className="mt-3.5"
      />
      <div className="grid flex-1">
        <Label htmlFor={id} className="flex min-h-11 cursor-pointer items-center">
          {t('relaySource.saveOnDevice', { defaultValue: 'Save on this device' })}
        </Label>
        <p id={`${id}-hint`} className="-mt-2 text-xs text-muted-foreground">
          {t('relaySource.saveOnDeviceHint', {
            defaultValue: 'Adds it to this menu in this browser only. Nothing is published.',
          })}
        </p>
      </div>
    </div>
  )
}

export function SettingsUnchangedNote() {
  const { t } = useTranslation()
  return (
    <p className="text-xs text-muted-foreground">
      {t('relaySource.settingsUnchanged', {
        defaultValue:
          'Only this feed changes. Your read and publish relays stay as they are, and your content filters still apply.',
      })}
    </p>
  )
}

const footerButton = 'h-11 sm:h-10'

/** Focused entry for one relay URL. Opens it for browsing; never touches relay settings. */
export function AddRelayDialog({
  open,
  onOpenChange,
  initialValue,
}: DialogProps & { initialValue?: string }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('relaySource.addRelayTitle', { defaultValue: 'Open a Relay' })}
          </DialogTitle>
          <DialogDescription>
            {t('relaySource.addRelayDescription', {
              defaultValue: 'Browse videos published to one relay.',
            })}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from a clean form. */}
        <AddRelayForm initialValue={initialValue ?? ''} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AddRelayForm({ initialValue, onDone }: { initialValue: string; onDone: () => void }) {
  const { t } = useTranslation()
  const { selectSource, saveSource } = useRelayBrowsing()
  const id = useId()
  const [value, setValue] = useState(initialValue)
  const [touched, setTouched] = useState(Boolean(initialValue))
  const [save, setSave] = useState(false)

  let result: { source: BrowseSource } | { error: string } | null = null
  if (value.trim()) {
    try {
      result = { source: relaySource(value) }
    } catch (e) {
      result = { error: errorMessage(e) }
    }
  }
  const error = touched && result && 'error' in result ? result.error : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!result || !('source' in result)) return
    if (save) saveSource(result.source)
    selectSource(result.source)
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={id}>{t('relaySource.relayUrlLabel', { defaultValue: 'Relay URL' })}</Label>
        <Input
          id={id}
          type="url"
          inputMode="url"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="wss://relay.example.com"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-status`}
        />
        <p
          id={`${id}-status`}
          role={error ? 'alert' : undefined}
          className={cn('text-xs break-all', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {error ??
            (result && 'source' in result
              ? t('relaySource.willOpen', {
                  url: result.source.relays[0],
                  defaultValue: 'Opens {{url}}',
                })
              : t('relaySource.relayUrlHint', {
                  defaultValue: 'A hostname such as relay.example.com or a wss:// address.',
                }))}
        </p>
      </div>
      <SaveLocallyField checked={save} onCheckedChange={setSave} />
      <SettingsUnchangedNote />
      <DialogFooter className="gap-2 sm:gap-0">
        <DialogClose asChild>
          <Button type="button" variant="outline" className={footerButton}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!value.trim()} className={footerButton}>
          {t('relaySource.openRelayAction', { defaultValue: 'Open Relay' })}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * Preview-then-open for a kind-30002 relay set. Nothing connects to the members until Open,
 * and the preview always describes exactly the address in the field.
 */
export function OpenRelaySetDialog({
  open,
  onOpenChange,
  initialValue,
  preview,
}: DialogProps & { initialValue?: string; preview?: BrowseSource }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('relaySource.openSetTitle', { defaultValue: 'Open a Relay Set' })}
          </DialogTitle>
          <DialogDescription>
            {preview?.relays.length
              ? t('relaySource.openSetKnownDescription', {
                  defaultValue: 'Check the relays in this set before opening it.',
                })
              : t('relaySource.openSetDescription', {
                  defaultValue:
                    'Paste a relay set address. You can check its relays before anything connects to them.',
                })}
          </DialogDescription>
        </DialogHeader>
        <RelaySetForm
          initialValue={initialValue ?? (preview?.relays.length ? '' : (preview?.address ?? ''))}
          initialPreview={preview?.relays.length ? preview : undefined}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function RelaySetForm({
  initialValue,
  initialPreview,
  onDone,
}: {
  initialValue: string
  initialPreview?: BrowseSource
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { resolveSet, selectSource, saveSource } = useRelayBrowsing()
  const id = useId()
  const [value, setValue] = useState(initialValue)
  const [preview, setPreview] = useState<BrowseSource | null>(initialPreview ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [save, setSave] = useState(false)
  // Bumped on every new request, edit and unmount: late answers for an old request are dropped.
  const request = useRef(0)
  const runPreview = async (address: string) => {
    if (!address.trim()) return
    const ticket = ++request.current
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const result = await resolveSet(address)
      if (ticket === request.current) setPreview(result)
    } catch (e) {
      if (ticket === request.current) setError(errorMessage(e))
    } finally {
      if (ticket === request.current) setLoading(false)
    }
  }

  useEffect(() => {
    const current = request
    // A given address (saved set, typed naddr) is looked up at once: metadata only, members
    // are not contacted until Open.
    if (initialValue && !initialPreview) void runPreview(initialValue)
    return () => {
      current.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, [])

  const edit = (next: string) => {
    request.current += 1
    setValue(next)
    setPreview(null)
    setError(null)
    setLoading(false)
  }

  const openSet = () => {
    if (!preview) return
    if (save) saveSource(preview)
    selectSource(preview)
    onDone()
  }

  return (
    <div className="grid gap-4">
      {!initialPreview && (
        <form
          onSubmit={event => {
            event.preventDefault()
            void runPreview(value)
          }}
          noValidate
          className="grid gap-2"
        >
          <Label htmlFor={id}>
            {t('relaySource.setAddressLabel', { defaultValue: 'Relay set address' })}
          </Label>
          <div className="flex gap-2">
            <Input
              id={id}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="naddr1… / nostr:naddr1…"
              value={value}
              onChange={e => edit(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-status`}
              className="h-11 sm:h-10"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={!value.trim() || loading}
              className="h-11 shrink-0 sm:h-10"
            >
              {loading && <Loader2 className="animate-spin" aria-hidden />}
              {t('relaySource.previewAction', { defaultValue: 'Preview' })}
            </Button>
          </div>
          <p
            id={`${id}-status`}
            role={error ? 'alert' : 'status'}
            className={cn(
              'text-xs break-words',
              error ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {error ??
              (loading
                ? t('relaySource.previewLoading', { defaultValue: 'Looking up the relay set…' })
                : t('relaySource.setAddressHint', {
                    defaultValue:
                      'Only public entries are read. Private entries are not decrypted.',
                  }))}
          </p>
        </form>
      )}

      {preview && <RelaySetPreview source={preview} />}

      {preview && <SaveLocallyField checked={save} onCheckedChange={setSave} />}
      <SettingsUnchangedNote />
      <DialogFooter className="gap-2 sm:gap-0">
        <DialogClose asChild>
          <Button type="button" variant="outline" className={footerButton}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </DialogClose>
        <Button type="button" disabled={!preview} onClick={openSet} className={footerButton}>
          {t('relaySource.openSetAction', { defaultValue: 'Open Relay Set' })}
        </Button>
      </DialogFooter>
    </div>
  )
}

function RelaySetPreview({ source }: { source: BrowseSource }) {
  const { t } = useTranslation()
  let pubkey: string | undefined
  try {
    pubkey = source.address ? decodeRelaySet(source.address).pubkey : undefined
  } catch {
    pubkey = undefined
  }
  return (
    <section
      aria-label={t('relaySource.previewLabel', { defaultValue: 'Relay set preview' })}
      className="grid gap-3 rounded-lg border bg-muted/30 p-3"
    >
      <div className="grid gap-1">
        <h3 className="text-base font-semibold break-words">{source.title}</h3>
        {pubkey && <SetAuthor pubkey={pubkey} />}
        {source.address && (
          <p className="font-mono text-xs break-all text-muted-foreground">{source.address}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">
          {t('relaySource.relayCount', { count: source.relays.length, ...RELAY_COUNT })}
        </p>
        <RelayMemberList relays={source.relays} />
      </div>
    </section>
  )
}

export function SetAuthor({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const profile = useProfile({ pubkey })
  const name = profile?.display_name || profile?.name || genUserName(pubkey)
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <UserAvatar picture={profile?.picture} pubkey={pubkey} name={name} className="h-6 w-6" />
      <span className="min-w-0 truncate">
        {t('relaySource.setAuthor', { name, defaultValue: 'By {{name}}' })}
      </span>
    </div>
  )
}

/** Member URLs, wrapped rather than truncated so similar hosts stay distinguishable. */
export function RelayMemberList({ relays }: { relays: string[] }) {
  return (
    <ul className="grid max-h-48 gap-1 overflow-y-auto">
      {relays.map(url => (
        <li key={url} className="flex items-start gap-2 text-xs">
          <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-mono break-all">{url}</span>
        </li>
      ))}
    </ul>
  )
}
