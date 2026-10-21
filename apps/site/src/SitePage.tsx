import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import {
  SITE_PAGES,
  pageText,
  type InstanceConfig,
  type SitePageKey,
} from '@nostube/core/instance-config'
import { RichTextContent } from '@nostube/widgets/components/RichTextContent'
import { IosInstallDialog } from '@nostube/widgets/components/InstallHint'
import { useInstallState } from '@nostube/widgets/hooks/useInstallState'
import { getInstallMode, promptInstall } from '@nostube/widgets/install-prompt'
import { siteLinks } from './site-links'

/** The pages the admin wrote (and the text of each in the visitor's language). */
function usePages(config: InstanceConfig) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  return SITE_PAGES.flatMap(page => {
    const text = pageText(config.site.pages[page], language)
    return text === undefined ? [] : [{ page, text }]
  })
}

/** The about, imprint or privacy page; a page the admin left empty does not exist. */
export function SitePage({ config, page }: { config: InstanceConfig; page: SitePageKey }) {
  const { t } = useTranslation()
  const text = usePages(config).find(p => p.page === page)?.text
  if (text === undefined) return <Navigate to="/" replace />
  return (
    <article className="space-y-3">
      <h2 className="text-xl font-semibold">{t(`site.pages.${page}`)}</h2>
      <RichTextContent content={text} links={siteLinks(config)} className="break-words text-sm" />
    </article>
  )
}

/** Links to the pages that exist, the RSS feed and an "Install app" entry. */
export function SiteFooter({ config }: { config: InstanceConfig }) {
  const { t } = useTranslation()
  const pages = usePages(config)
  const installMode = getInstallMode(useInstallState())
  const [iosOpen, setIosOpen] = useState(false)
  return (
    <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
      <a href="/feed.xml" className="hover:text-foreground hover:underline">
        {t('site.feed.label')}
      </a>
      {pages.length > 0 && (
        <nav aria-label={t('site.pages.label')} className="flex flex-wrap gap-x-4 gap-y-1">
          {pages.map(({ page }) => (
            <Link key={page} to={`/${page}`} className="hover:text-foreground hover:underline">
              {t(`site.pages.${page}`)}
            </Link>
          ))}
        </nav>
      )}
      {installMode && (
        <>
          <button
            type="button"
            className="hover:text-foreground hover:underline"
            onClick={() => (installMode === 'prompt' ? void promptInstall() : setIosOpen(true))}
          >
            {t('install.title')}
          </button>
          <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />
        </>
      )}
    </footer>
  )
}
