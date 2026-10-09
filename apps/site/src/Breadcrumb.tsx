import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/** `Site title › current page` at the top of a video page; the site title leads back to the grid. */
export function Breadcrumb({
  title,
  logo,
  picture,
  current,
}: {
  title: string
  /** The instance logo; the creator's picture is the fallback. */
  logo?: string
  picture?: string
  /** Leave out on a page that is not a video (an error notice): only the site title shows. */
  current?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('site.breadcrumb.label')}
      className="flex min-w-0 items-center gap-2 text-sm"
    >
      <Link to="/" className="flex shrink-0 items-center gap-2 font-medium hover:underline">
        {logo ? (
          <img src={logo} alt="" className="h-6 w-auto max-w-24 object-contain" />
        ) : (
          picture && <img src={picture} alt="" className="h-6 w-6 rounded-full object-cover" />
        )}
        {title}
      </Link>
      {current !== undefined && (
        <>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span aria-current="page" className="min-w-0 truncate text-muted-foreground">
            {current}
          </span>
        </>
      )}
    </nav>
  )
}
