import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle } from 'lucide-react'
import { SITE_PAGES, isVideoKind } from '@nostube/core/instance-config'
import { Button } from '@nostube/widgets/components/button'
import { Card, CardContent } from '@nostube/widgets/components/card'
import { loadStats, type AdminConfig, type AdminState } from './api'
import { PageHeader } from './PageHeader'
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

export interface Step {
  id: string
  done: boolean
  href: string
}

export interface Checklist {
  steps: Step[]
  dismiss: () => void
  viewSite: () => void
}

/**
 * What is left to make the site the creator's own, from the saved config, the branding and the
 * relay's counts. `undefined` while the counts load (so a finished list does not flash up), `null`
 * once everything is done or the owner dismissed it (in this browser).
 */
export function useChecklist(
  config: AdminConfig,
  branding: AdminState['branding']
): Checklist | null | undefined {
  const { mode } = useSigner()
  const [dismissed, setDismissed] = useState(() => flag(DISMISSED))
  const [siteViewed, setSiteViewed] = useState(() => flag(SITE_VIEWED))
  const [hasVideos, setHasVideos] = useState<boolean | null>(null)

  useEffect(() => {
    if (dismissed) return
    let live = true
    loadStats()
      .then(
        stats =>
          live &&
          setHasVideos(stats.relay.eventsByKind.some(k => isVideoKind(k.kind) && k.count > 0))
      )
      .catch(() => live && setHasVideos(false))
    return () => {
      live = false
    }
  }, [dismissed])

  if (dismissed) return null
  if (hasVideos === null) return undefined

  const steps: Step[] = [
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
  return {
    steps,
    dismiss: () => {
      setFlag(DISMISSED)
      setDismissed(true)
    },
    viewSite: () => {
      setFlag(SITE_VIEWED)
      setSiteViewed(true)
    },
  }
}

/** The checklist as a page of its own; the sidebar lists it only while something is left. */
export function NextSteps({ checklist }: { checklist: Checklist }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('studio.nav.pages.start')}
        description={t('studio.nextSteps.description')}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={checklist.dismiss}>
            {t('studio.nextSteps.dismiss')}
          </Button>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <ul className="space-y-3 text-sm">
            {checklist.steps.map(step => {
              const Icon = step.done ? CheckCircle2 : Circle
              const external = step.href === '/'
              return (
                <li key={step.id} className="flex items-center gap-2.5">
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
                      onClick: checklist.viewSite,
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
    </div>
  )
}
