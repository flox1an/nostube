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
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const container = categoriesRef.current
    if (!container) return

    const updateScrollHint = () => {
      const left = container.scrollLeft > 1
      const right = container.scrollWidth - container.clientWidth - container.scrollLeft > 1
      setScrollEdges(prev => (prev.left === left && prev.right === right ? prev : { left, right }))
    }

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

  const maskGradient =
    scrollEdges.left && scrollEdges.right
      ? 'linear-gradient(to right, transparent, black 36px, black calc(100% - 40px), transparent)'
      : scrollEdges.right
        ? 'linear-gradient(to right, black calc(100% - 40px), transparent)'
        : scrollEdges.left
          ? 'linear-gradient(to right, transparent, black 36px)'
          : undefined

  return (
    <div className="flex w-full items-center">
      <div
        ref={categoriesRef}
        className="min-w-0 flex-1 overflow-x-auto scroll-smooth scroll-pr-6 scrollbar-hide"
        style={
          maskGradient ? { maskImage: maskGradient, WebkitMaskImage: maskGradient } : undefined
        }
      >
        <div className="flex min-w-max gap-2 py-2 pr-2 pl-4 sm:pl-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'relative h-10 shrink-0 rounded-full px-4 after:absolute after:inset-x-0 after:-inset-y-0.5',
              !activeSlug
                ? 'border border-white/30 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                : 'border border-foreground/25 bg-transparent hover:border-foreground hover:bg-transparent'
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
                    ? 'border border-white/30 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                    : 'border border-foreground/25 bg-transparent hover:border-foreground hover:bg-transparent'
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
