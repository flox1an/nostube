import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  BookmarkMinus,
  ChevronDown,
  Copy,
  Layers,
  Loader2,
  Settings,
  Wifi,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@nostube/widgets/components/collapsible'
import { useRelayBrowsing } from '@/contexts/RelayBrowsingContext'
import { decodeRelaySet, sourceKey } from '@/lib/relay-browsing'
import { cn } from '@/lib/utils'
import {
  BROWSE_SETTINGS_PATH,
  OpenRelaySetDialog,
  RELAY_COUNT,
  RelayMemberList,
  SetAuthor,
} from './RelaySourcePicker'

const actionClass = 'h-11 sm:h-9'

/** What the timeline below is reading from, and the ways out of it. Hidden on the default feed. */
export function RelayBrowseStatus() {
  const { t } = useTranslation()
  const { source, pendingSource, selectSource, favorites, saveSource, removeFavorite, error } =
    useRelayBrowsing()
  const [expanded, setExpanded] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const headingId = useId()

  if (!source && !error) return null

  // A linked set has no members until it is looked up and explicitly opened.
  const unresolved = source !== null && source.relays.length === 0
  // Before approval, describe the set from its looked-up metadata; nothing has connected yet.
  const shown = unresolved && pendingSource ? pendingSource : source
  const key = source && !unresolved ? sourceKey(source) : null
  const saved = key !== null && favorites.some(favorite => sourceKey(favorite) === key)
  let author: string | undefined
  try {
    author = shown?.address ? decodeRelaySet(shown.address).pubkey : undefined
  } catch {
    author = undefined
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t('relaySource.linkCopied', { defaultValue: 'Link copied' }))
    } catch {
      toast.error(
        t('relaySource.copyFailed', {
          defaultValue: "Couldn't copy the link. Copy it from the address bar instead.",
        })
      )
    }
  }

  const actions = (
    <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className={actionClass}
        onClick={() => selectSource(null)}
      >
        <ArrowLeft aria-hidden />
        {t('relaySource.backToMyFeed', { defaultValue: 'Back to My feed' })}
      </Button>
      {source &&
        key !== null &&
        (saved ? (
          <Button
            variant="outline"
            size="sm"
            className={actionClass}
            onClick={() => removeFavorite(key)}
          >
            <BookmarkMinus aria-hidden />
            {t('relaySource.removeFromDevice', { defaultValue: 'Remove from this device' })}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={actionClass}
            onClick={() => saveSource(source)}
          >
            <Bookmark aria-hidden />
            {t('relaySource.saveOnDevice', { defaultValue: 'Save on this device' })}
          </Button>
        ))}
      {key !== null && (
        <Button variant="outline" size="sm" className={actionClass} onClick={copyLink}>
          <Copy aria-hidden />
          {t('relaySource.copyLink', { defaultValue: 'Copy link' })}
        </Button>
      )}
      <Button variant="ghost" size="sm" className={actionClass} asChild>
        <Link to={BROWSE_SETTINGS_PATH}>
          <Settings aria-hidden />
          {t('relaySource.manageInSettings', { defaultValue: 'Manage in Settings' })}
        </Link>
      </Button>
    </div>
  )

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 grid gap-3 rounded-lg border bg-card p-3 sm:mb-8 sm:p-4"
    >
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {t('relaySource.errorTitle', { defaultValue: "Can't open this source" })}
          </AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}

      {shown ? (
        <Collapsible open={expanded} onOpenChange={setExpanded} className="grid gap-2">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-[1_1_14rem] items-start gap-3">
              {shown.address || shown.relays.length > 1 ? (
                <Layers className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <Wifi className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <h2 id={headingId} className="text-base font-semibold break-words">
                  {shown.title}
                </h2>
                {(!unresolved || pendingSource) && (
                  <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                    {shown.address && (
                      <span>{t('relaySource.relaySet', { defaultValue: 'Relay set' })} ·</span>
                    )}
                    {!unresolved ? (
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-my-1 -ml-2 h-11 gap-1 px-2 font-normal text-muted-foreground sm:h-9"
                        >
                          {t('relaySource.relayCount', {
                            count: shown.relays.length,
                            ...RELAY_COUNT,
                          })}
                          <ChevronDown
                            aria-hidden
                            className={cn(
                              'transition-transform motion-reduce:transition-none',
                              expanded && 'rotate-180'
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    ) : (
                      <span>
                        {t('relaySource.relayCount', {
                          count: shown.relays.length,
                          ...RELAY_COUNT,
                        })}
                      </span>
                    )}
                  </div>
                )}
                {!unresolved && (
                  <CollapsibleContent className="grid gap-2 pt-1">
                    {author && <SetAuthor pubkey={author} />}
                    {shown.address && (
                      <p className="font-mono text-xs break-all text-muted-foreground">
                        {shown.address}
                      </p>
                    )}
                    <RelayMemberList relays={shown.relays} />
                  </CollapsibleContent>
                )}
              </div>
            </div>
            {actions}
          </div>

          {unresolved && source?.address && (
            <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t('relaySource.pendingSet', {
                  defaultValue:
                    'This link opens a relay set. Check its relays first; nothing connects to them until you open it.',
                })}
              </p>
              <Button className={cn(actionClass, 'shrink-0')} onClick={() => setPreviewOpen(true)}>
                {t('relaySource.previewAndOpen', { defaultValue: 'Preview and Open' })}
              </Button>
            </div>
          )}
          {unresolved && !pendingSource && !error && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              {t('relaySource.setResolving', { defaultValue: 'Looking up the relay set…' })}
            </p>
          )}
        </Collapsible>
      ) : (
        <>
          <h2 id={headingId} className="sr-only">
            {t('relaySource.statusLabel', { defaultValue: 'Feed source' })}
          </h2>
          {actions}
        </>
      )}

      {source?.address && (
        <OpenRelaySetDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          initialValue={pendingSource ? undefined : source.address}
          preview={pendingSource ?? undefined}
        />
      )}
    </section>
  )
}
