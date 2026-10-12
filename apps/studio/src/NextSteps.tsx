import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { SITE_PAGES, isVideoKind } from '@nostube/core/instance-config'
import { Button } from '@nostube/widgets/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nostube/widgets/components/card'
import { loadStats, type AdminConfig, type AdminState } from './api'
import { hashFor } from './route'
import { useSigner } from './signer-context'

const DISMISSED = 'nostube-studio:next-steps-dismissed'
const SITE_VIEWED = 'nostube-studio:site-viewed'

/** A flag of this browser; storage blocked reads as unset. */
function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function setFlag(key: string) {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Storage blocked: the flag lasts until the page reloads.
  }
}

/**
 * What is left to make the site the creator's own, from the saved config, the branding and the
 * relay's counts. Gone once everything is done or the owner dismisses it (in this browser).
 */
export function NextSteps({
  config,
  branding,
}: {
  config: AdminConfig
  branding: AdminState['branding']
}) {
  const { t } = useTranslation()
  const { mode } = useSigner()
  const [dismissed, setDismissed] = useState(() => flag(DISMISSED))
  const [siteViewed, setSiteViewed] = useState(() => flag(SITE_VIEWED))
  // null until the stats are in, so a finished checklist does not flash up first.
  const [hasVideos, setHasVideos] = useState<boolean | null>(null)

  useEffect(() => {
    if (dismissed) return
    let live = true
    loadStats().then(
      stats =>
        live &&
        setHasVideos(stats.relay.eventsByKind.some(k => isVideoKind(k.kind) && k.count > 0)),
      () => live && setHasVideos(false)
    )
    return () => {
      live = false
    }
  }, [dismissed])

  if (dismissed || hasVideos === null) return null

  const steps = [
    { id: 'upload', done: hasVideos, href: hashFor('upload') },
    { id: 'logo', done: branding.logo !== null, href: hashFor('appearance') },
    {
      id: 'pages',
      done: SITE_PAGES.some(page => Object.values(config.site.pages[page]).some(Boolean)),
      href: hashFor('sitePages'),
    },
    // The address goes into the profile of the managed key only.
    ...(mode === 'managed'
      ? [{ id: 'lightning', done: Boolean(config.site.lightning), href: hashFor('appearance') }]
      : []),
    { id: 'viewSite', done: siteViewed, href: '/' },
  ]
  if (steps.every(step => step.done)) return null

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{t('studio.nextSteps.title')}</CardTitle>
          <CardDescription>{t('studio.nextSteps.description')}</CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('studio.nextSteps.dismiss')}
          onClick={() => {
            setFlag(DISMISSED)
            setDismissed(true)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {steps.map(step => {
            const Icon = step.done ? CheckCircle2 : Circle
            const external = step.href === '/'
            return (
              <li key={step.id} className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 shrink-0 ${step.done ? 'text-primary' : 'text-muted-foreground'}`}
                  aria-hidden
                />
                <a
                  href={step.href}
                  className={`hover:underline ${step.done ? 'text-muted-foreground line-through' : ''}`}
                  {...(external && {
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    onClick: () => {
                      setFlag(SITE_VIEWED)
                      setSiteViewed(true)
                    },
                  })}
                >
                  {t(`studio.nextSteps.items.${step.id}`)}
                </a>
                {step.done && <span className="sr-only">{t('studio.nextSteps.done')}</span>}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
