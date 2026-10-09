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
import { THEME_BACKGROUNDS, applyTheme, contrastRatio } from '@nostube/widgets/site-theme'
import { LINK_PRESETS, linkPresetOf, type Draft } from './draft'
import { Field } from './fields'

const FONT_LABELS: Record<SiteFont, string> = {
  sans: 'Sans-serif',
  serif: 'Serif',
  mono: 'Monospace',
}

const ACCENT = /^#[0-9a-fA-F]{6}$/

/** Where the accent is hard to see: the page background it sits on, in light or dark mode. */
function lowContrastModes(accent: string): string[] {
  if (!ACCENT.test(accent)) return []
  return (['light', 'dark'] as const).filter(
    mode => contrastRatio(accent, THEME_BACKGROUNDS[mode]) < 3
  )
}

export interface PageProps {
  draft: Draft
  update: (patch: Partial<Draft>) => void
}

/** Title, tagline, accent colour, font and where links to other Nostr content go. */
export function AppearancePage({ draft, update }: PageProps) {
  const preview = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!preview.current || !ACCENT.test(draft.accent)) return
    applyTheme({ theme: { accent: draft.accent, font: draft.font } }, preview.current)
  }, [draft.accent, draft.font])

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
            <Field
              id="accent"
              label="Accent colour"
              hint={
                lowContrastModes(draft.accent).length > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Little contrast against the {lowContrastModes(draft.accent).join(' and ')} page
                    background: buttons and links may be hard to see for some visitors.
                  </span>
                ) : (
                  'Buttons, links and the focus ring.'
                )
              }
            >
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
            <CardTitle>Links to other Nostr content</CardTitle>
            <CardDescription>
              A description can mention people, videos of other creators and notes. Your site opens
              your own videos itself; everything else goes to the viewer you choose here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="link-preset" label="Open them on">
              <select
                id="link-preset"
                value={linkPresetOf(draft.links)}
                onChange={e => {
                  const preset = LINK_PRESETS.find(p => p.id === e.target.value)
                  if (preset) update({ links: { ...preset.links } })
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {LINK_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {linkPresetOf(draft.links) === 'custom' && <option value="custom">Custom</option>}
              </select>
            </Field>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Edit the addresses</summary>
              <div className="space-y-3 pt-3">
                {(
                  [
                    ['profile', 'People'],
                    ['video', 'Videos'],
                    ['note', 'Notes'],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    id={`link-${key}`}
                    label={label}
                    hint={
                      key === 'profile'
                        ? 'An https:// address with {nip19} where the identifier goes.'
                        : undefined
                    }
                  >
                    <Input
                      id={`link-${key}`}
                      value={draft.links[key]}
                      className="font-mono text-xs"
                      spellCheck={false}
                      onChange={e => update({ links: { ...draft.links, [key]: e.target.value } })}
                    />
                  </Field>
                ))}
              </div>
            </details>
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
