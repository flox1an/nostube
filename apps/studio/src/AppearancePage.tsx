import { useEffect, useRef } from 'react'
import { SITE_FONTS, type SiteFont } from '@nostube/core/instance-config'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Input } from '@nostube/widgets/components/input'
import { Textarea } from '@nostube/widgets/components/textarea'
import { applyTheme } from '@nostube/widgets/site-theme'
import type { Draft } from './draft'
import { Field } from './fields'

const FONT_LABELS: Record<SiteFont, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Monospace',
}

const ACCENT = /^#[0-9a-fA-F]{6}$/

export interface PageProps {
  draft: Draft
  update: (patch: Partial<Draft>) => void
}

/** Title, tagline, accent colour, font and the videos the public site does not show. */
export function AppearancePage({ draft, update }: PageProps) {
  const preview = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!preview.current || !ACCENT.test(draft.accent)) return
    applyTheme(
      {
        tagline: draft.tagline,
        theme: { accent: draft.accent, font: draft.font },
        videos: { hidden: [] },
      },
      preview.current
    )
  }, [draft.accent, draft.font, draft.tagline])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your site</CardTitle>
            <CardDescription>The heading and the line below it on the public page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="title" label="Title">
              <Input
                id="title"
                value={draft.title}
                onChange={e => update({ title: e.target.value })}
              />
            </Field>
            <Field id="tagline" label="Tagline" hint="Optional.">
              <Input
                id="tagline"
                value={draft.tagline}
                onChange={e => update({ tagline: e.target.value })}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Look</CardTitle>
            <CardDescription>
              Visitors see light or dark mode following their system; the colour and font are yours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="accent" label="Accent colour" hint="Buttons, links and the focus ring.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick the accent colour"
                  value={ACCENT.test(draft.accent) ? draft.accent : '#000000'}
                  onChange={e => update({ accent: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                />
                <Input
                  id="accent"
                  value={draft.accent}
                  onChange={e => update({ accent: e.target.value })}
                  className="w-32 font-mono"
                  spellCheck={false}
                />
              </div>
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Font</legend>
              <div className="flex flex-wrap gap-2">
                {SITE_FONTS.map(font => (
                  <label
                    key={font}
                    className={`cursor-pointer rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-ring ${
                      font === 'serif' ? 'font-serif' : font === 'mono' ? 'font-mono' : 'font-sans'
                    }`}
                  >
                    <input
                      type="radio"
                      name="font"
                      value={font}
                      checked={draft.font === font}
                      onChange={() => update({ font })}
                      className="sr-only"
                    />
                    {FONT_LABELS[font]}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hidden videos</CardTitle>
            <CardDescription>
              The site shows every video of your creators except these. New uploads appear on their
              own.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      <aside>
        <p className="mb-2 text-sm font-medium">Preview</p>
        <div
          ref={preview}
          className="space-y-3 rounded-lg border border-border bg-background p-4 text-foreground"
        >
          <div>
            <p className="text-2xl font-semibold">{draft.title || 'Your title'}</p>
            {draft.tagline && <p className="text-sm text-muted-foreground">{draft.tagline}</p>}
          </div>
          <div className="aspect-video rounded-md bg-muted" />
          <p className="text-sm font-medium">A video title</p>
          <Button type="button" size="sm">
            Primary button
          </Button>
        </div>
      </aside>
    </div>
  )
}
