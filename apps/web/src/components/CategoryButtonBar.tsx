import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@nostube/widgets/components/button'
import { TAG_CATEGORIES } from '@/lib/tag-categories'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

interface CategoryButtonBarProps {
  activeSlug?: string
}

export function CategoryButtonBar({ activeSlug }: CategoryButtonBarProps) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const categoriesRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const container = categoriesRef.current
    if (!container) return

    const updateScrollHint = () =>
      setCanScrollRight(container.scrollWidth - container.clientWidth - container.scrollLeft > 1)

    updateScrollHint()
    container.addEventListener('scroll', updateScrollHint, { passive: true })
    const observer = new ResizeObserver(updateScrollHint)
    observer.observe(container)
    if (container.firstElementChild) observer.observe(container.firstElementChild)

    return () => {
      container.removeEventListener('scroll', updateScrollHint)
      observer.disconnect()
    }
  }, [])

  return (
    <div className="flex w-full items-center">
      <div
        ref={categoriesRef}
        className="min-w-0 flex-1 overflow-x-auto scroll-smooth scroll-pr-6 scrollbar-hide"
        style={{
          maskImage: canScrollRight
            ? 'linear-gradient(to left, transparent, black 24px)'
            : undefined,
        }}
      >
        <div className="flex min-w-max gap-2 py-2 pr-2 pl-4 sm:pl-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'relative h-10 shrink-0 rounded-full px-4 after:absolute after:inset-x-0 after:-inset-y-0.5',
              !activeSlug
                ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background'
                : 'border border-transparent bg-secondary/70 hover:border-border'
            )}
            onClick={() => navigate({ pathname: '/', search })}
            aria-pressed={!activeSlug}
          >
            All
          </Button>
          {TAG_CATEGORIES.map(category => {
            const isActive = activeSlug === category.slug

            return (
              <Button
                key={category.slug}
                variant="ghost"
                size="sm"
                className={cn(
                  'relative h-10 shrink-0 rounded-full px-4 after:absolute after:inset-x-0 after:-inset-y-0.5',
                  isActive
                    ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background'
                    : 'border border-transparent bg-secondary/70 hover:border-border'
                )}
                onClick={() => navigate({ pathname: `/category/${category.slug}`, search })}
                aria-pressed={isActive}
              >
                {category.name}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
