import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { Textarea } from '@nostube/widgets/components/textarea'
import type { AdminState } from './api'
import { Field } from './fields'
import type { PageProps } from './AppearancePage'

const lines = 'font-mono text-xs'

/** Whose videos the site shows, where they come from, who may write, search and storage. */
export function InstancePage({ draft, update, state }: PageProps & { state: AdminState }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Creators and relays</CardTitle>
          <CardDescription>
            Whose videos the site shows, and where they are read from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            id="creators"
            label="Displayed creators"
            hint="One hex or npub key per line. The first one is the start page."
          >
            <Textarea
              id="creators"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.creatorsText}
              onChange={e => update({ creatorsText: e.target.value })}
            />
          </Field>
          <Field
            id="writers"
            label="Allowed writers"
            hint="One key per line. These keys may publish to your relay and upload to your storage."
          >
            <Textarea
              id="writers"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.writersText}
              onChange={e => update({ writersText: e.target.value })}
            />
          </Field>
          <Field
            id="video-sources"
            label="Video sources"
            hint="One ws:// or wss:// relay per line."
          >
            <Textarea
              id="video-sources"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.videoSourcesText}
              onChange={e => update({ videoSourcesText: e.target.value })}
            />
          </Field>
          <Field
            id="interaction-relays"
            label="Interaction relays"
            hint="One ws:// or wss:// relay per line. Used for profiles and, later, comments and zaps."
          >
            <Textarea
              id="interaction-relays"
              rows={3}
              className={lines}
              spellCheck={false}
              value={draft.interactionRelaysText}
              onChange={e => update({ interactionRelaysText: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="search-mode" label="Search">
            <select
              id="search-mode"
              value={draft.searchMode}
              onChange={e => update({ searchMode: e.target.value as typeof draft.searchMode })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="off">Off</option>
              <option value="local">Local</option>
              <option value="external">External</option>
            </select>
          </Field>
          {draft.searchMode === 'external' && (
            <Field id="search-url" label="Search instance" hint="An https:// URL.">
              <Input
                id="search-url"
                value={draft.searchUrl}
                placeholder="https://"
                onChange={e => update({ searchUrl: e.target.value })}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="quota" label="Quota (GiB)" hint="0 means unlimited.">
            <Input
              id="quota"
              type="number"
              min={0}
              value={draft.quota}
              onChange={e => update({ quota: e.target.value })}
            />
          </Field>
          <Field id="reserve" label="Free-space reserve (GiB)">
            <Input
              id="reserve"
              type="number"
              min={0}
              value={draft.reserve}
              onChange={e => update({ reserve: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Origin <code>{state.origin}</code> and TLS ({state.tls}) are fixed here.
      </p>
    </div>
  )
}
