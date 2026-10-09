import { lazy, Suspense, type ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { Textarea } from '@nostube/widgets/components/textarea'
import type { Draft } from './draft'
import { Field } from './fields'

const HiddenVideosPicker = lazy(() => import('./HiddenVideosPicker'))

/** The creator's videos; a switch each hides one from the public site. */
export function VideosPage({
  draft,
  update,
  banner,
}: {
  draft: Draft
  update: (patch: Partial<Draft>) => void
  banner: ReactNode
}) {
  return (
    <div className="space-y-6">
      {banner}
      <Card>
        <CardHeader>
          <CardTitle>Videos</CardTitle>
          <CardDescription>
            The site shows every video of your creators except the ones you switch off here. New
            uploads appear on their own.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <HiddenVideosPicker
              hiddenText={draft.hiddenText}
              onChange={hiddenText => update({ hiddenText })}
            />
          </Suspense>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Edit as text</summary>
            <div className="pt-3">
              <Field
                id="hidden"
                label="One video per line"
                hint="Paste the link of its page on your site (…/v/naddr1…), or an naddr / nevent / note."
              >
                <Textarea
                  id="hidden"
                  rows={4}
                  value={draft.hiddenText}
                  onChange={e => update({ hiddenText: e.target.value })}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
              </Field>
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
