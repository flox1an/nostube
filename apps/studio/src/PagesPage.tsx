import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SITE_PAGES, SITE_PAGE_MAX_CHARS, type SitePageKey } from '@nostube/core/instance-config'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { Button } from '@nostube/widgets/components/button'
import { Textarea } from '@nostube/widgets/components/textarea'
import { widgetResources } from '@nostube/widgets/i18n'
import { LANGUAGES } from '@nostube/widgets/languages'
import type { PageProps } from './AppearancePage'
import { DEFAULT_PAGE_LANGUAGES, privacyPolicy } from './default-pages'
import { Field } from './fields'

/** The languages the site speaks, then any other language a hand-edited config already has. */
function languagesOf(texts: Record<string, string>) {
  const known = LANGUAGES.filter(l => l.code in widgetResources)
  const extra = Object.keys(texts)
    .filter(code => !known.some(l => l.code === code))
    .map(code => ({ code, name: code }))
  return [...known, ...extra]
}

function PageCard({
  kind,
  texts,
  standard,
  onChange,
}: {
  kind: SitePageKey
  texts: Record<string, string>
  /** A ready-made text per language, when this page has one. */
  standard?: (language: string) => string | undefined
  onChange: (texts: Record<string, string>) => void
}) {
  const { t, i18n } = useTranslation()
  const languages = languagesOf(texts)
  const written = Object.keys(texts).filter(code => texts[code].trim())
  const [language, setLanguage] = useState(
    written[0] ?? languages.find(l => l.code === i18n.resolvedLanguage)?.code ?? 'en'
  )
  const text = texts[language] ?? ''
  const size = [...text].length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`studio.pages.kinds.${kind}`)}</CardTitle>
        <CardDescription>{t(`studio.pages.descriptions.${kind}`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field id={`${kind}-language`} label={t('studio.pages.language')}>
          <select
            id={`${kind}-language`}
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-64"
          >
            {languages.map(l => (
              <option key={l.code} value={l.code}>
                {l.name}
                {texts[l.code]?.trim() ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`${kind}-text`}
          label={t('studio.pages.text')}
          hint={
            <span className={size > SITE_PAGE_MAX_CHARS ? 'text-destructive' : undefined}>
              {t('studio.pages.size', { count: size, max: SITE_PAGE_MAX_CHARS })}
            </span>
          }
        >
          <Textarea
            id={`${kind}-text`}
            lang={language}
            rows={10}
            value={text}
            onChange={e => onChange({ ...texts, [language]: e.target.value })}
          />
        </Field>
        {standard && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={standard(language) === undefined}
                onClick={() => {
                  if (text.trim() && !window.confirm(t('studio.pages.replaceConfirm'))) return
                  onChange({ ...texts, [language]: standard(language) ?? text })
                }}
              >
                {t('studio.pages.useStandard')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onChange({
                    ...texts,
                    ...Object.fromEntries(
                      DEFAULT_PAGE_LANGUAGES.filter(lng => !texts[lng]?.trim()).flatMap(lng => {
                        const text = standard(lng)
                        return text === undefined ? [] : [[lng, text]]
                      })
                    ),
                  })
                }
              >
                {t('studio.pages.useStandardAll')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('studio.pages.standardHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The optional about, imprint and privacy pages of the site, one text per language. */
export function PagesPage({ draft, update }: PageProps) {
  const { t } = useTranslation()
  // The standard text names mandatory public defaults plus the Instance page's additional relays.
  const profileRelays = draft.profileRelaysText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">{t('studio.pages.intro')}</p>
      {SITE_PAGES.map(kind => (
        <PageCard
          key={kind}
          kind={kind}
          texts={draft.pages[kind]}
          standard={kind === 'privacy' ? lng => privacyPolicy(lng, profileRelays) : undefined}
          onChange={texts => update({ pages: { ...draft.pages, [kind]: texts } })}
        />
      ))}
    </div>
  )
}
