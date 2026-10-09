import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/** `Site title › current page` at the top of a video page; the site title leads back to the grid. */
export function Breadcrumb({
  title,
  picture,
  current,
}: {
  title: string
  picture?: string
  /** Leave out on a page that is not a video (an error notice): only the site title shows. */
  current?: ReactNode
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      <Link to="/" className="flex shrink-0 items-center gap-2 font-medium hover:underline">
        {picture && <img src={picture} alt="" className="h-6 w-6 rounded-full object-cover" />}
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
