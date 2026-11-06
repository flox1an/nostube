import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import { useCurrentUser } from '@/hooks'
import { toast } from '@/hooks/useToast'
import { useRelayBrowsing } from '@/contexts/RelayBrowsingContext'
import { relaySource, sourceKey, type BrowseSource } from '@/lib/relay-browsing'
import { AddRelayDialog, OpenRelaySetDialog } from '@/components/RelaySourcePicker'

const host = (url: string) => url.replace(/^wss?:\/\//, '')

/** Opens a source in the feed; never touches app relays or account lists. */
export function BrowseButton({ name, source }: { name: string; source: () => BrowseSource }) {
  const { t } = useTranslation()
  const { selectSource } = useRelayBrowsing()

  const browse = () => {
    try {
      selectSource(source())
    } catch (cause) {
      toast({
        title: t('settings.browseSources.cannotBrowse', {
          defaultValue: "Can't browse this source",
        }),
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      })
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-11 px-2 sm:h-9"
      onClick={browse}
      aria-label={t('settings.browseSources.browseItem', { name, defaultValue: 'Browse {{name}}' })}
    >
      {t('settings.browseSources.browse', { defaultValue: 'Browse' })}
    </Button>
  )
}

function SourceRow({
  name,
  detail,
  children,
}: {
  name: string
  detail: string
  children: ReactNode
}) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="truncate">{name}</p>
        <p className="truncate text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">{children}</div>
    </li>
  )
}

export function BrowseSourcesSettings() {
  const { t } = useTranslation()
  const { user } = useCurrentUser()
  const { favorites, removeFavorite, sets, favoriteRelays, setsLoading } = useRelayBrowsing()
  const [dialog, setDialog] = useState<'relay' | 'set' | null>(null)
  // A discovered set opens through the shared preview so members are checked before connecting.
  const [preview, setPreview] = useState<BrowseSource | undefined>()

  const detail = (source: BrowseSource) =>
    source.relays.length
      ? source.relays.map(host).join(', ')
      : t('settings.browseSources.relaySet', { defaultValue: 'Relay set' })

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t('settings.browseSources.explainer', {
          defaultValue:
            "Browse a relay or a public relay set to see only its videos on Home, Shorts and categories. Browsing doesn't change your default relays or your account's relay list.",
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setDialog('relay')}>
          {t('settings.browseSources.browseRelay', { defaultValue: 'Browse a Relay…' })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPreview(undefined)
            setDialog('set')
          }}
        >
          {t('settings.browseSources.openSet', { defaultValue: 'Open a Relay Set…' })}
        </Button>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-medium">
          {t('settings.browseSources.savedTitle', { defaultValue: 'Saved on this device' })}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('settings.browseSources.savedDescription', {
            action: t('relaySource.saveOnDevice', { defaultValue: 'Save on this device' }),
            defaultValue:
              'Kept in this browser for the current account only. To add one, choose "{{action}}" when you browse a relay or open a set.',
          })}
        </p>
        {favorites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('settings.browseSources.noSaved', { defaultValue: 'No saved sources.' })}
          </p>
        ) : (
          <ul className="space-y-1.5 rounded-md border p-3">
            {favorites.map(source => {
              const key = sourceKey(source)
              return (
                <SourceRow key={key} name={source.title} detail={detail(source)}>
                  {source.address ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 sm:h-9"
                      onClick={() => {
                        setPreview(source)
                        setDialog('set')
                      }}
                    >
                      {t('settings.browseSources.preview', { defaultValue: 'Preview…' })}
                    </Button>
                  ) : (
                    <BrowseButton name={source.title} source={() => source} />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 sm:h-9 sm:w-9"
                    onClick={() => removeFavorite(key)}
                    aria-label={t('settings.browseSources.removeSaved', {
                      name: source.title,
                      defaultValue: 'Remove {{name}} from saved sources',
                    })}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </SourceRow>
              )
            })}
          </ul>
        )}
      </div>

      {user && (
        <div className="space-y-1.5">
          <h4 className="text-sm font-medium">
            {t('settings.browseSources.publicTitle', {
              defaultValue: 'From your public Nostr lists',
            })}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('settings.browseSources.publicDescription', {
              defaultValue:
                'Public favorite relays and relay sets (NIP-51) from your account. Nostube only reads these lists; edit them in an app that manages relay sets.',
            })}
          </p>
          {setsLoading ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t('settings.browseSources.loading', { defaultValue: 'Loading lists…' })}
            </p>
          ) : sets.length + favoriteRelays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('settings.browseSources.noPublic', {
                defaultValue: 'No public favorite relays or relay sets found.',
              })}
            </p>
          ) : (
            <ul className="space-y-1.5 rounded-md border p-3">
              {sets.map(source => (
                <SourceRow key={sourceKey(source)} name={source.title} detail={detail(source)}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 px-2 sm:h-9"
                    onClick={() => {
                      setPreview(source)
                      setDialog('set')
                    }}
                    aria-label={t('settings.browseSources.previewItem', {
                      name: source.title,
                      defaultValue: 'Preview {{name}}',
                    })}
                  >
                    {t('settings.browseSources.preview', { defaultValue: 'Preview…' })}
                  </Button>
                </SourceRow>
              ))}
              {favoriteRelays.map(url => (
                <SourceRow
                  key={url}
                  name={host(url)}
                  detail={t('settings.browseSources.favoriteRelay', {
                    defaultValue: 'Favorite relay',
                  })}
                >
                  <BrowseButton name={host(url)} source={() => relaySource(url)} />
                </SourceRow>
              ))}
            </ul>
          )}
        </div>
      )}

      <AddRelayDialog
        open={dialog === 'relay'}
        onOpenChange={open => setDialog(open ? 'relay' : null)}
      />
      <OpenRelaySetDialog
        open={dialog === 'set'}
        onOpenChange={open => setDialog(open ? 'set' : null)}
        preview={preview}
      />
    </>
  )
}
