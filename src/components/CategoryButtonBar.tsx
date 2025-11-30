import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TAG_CATEGORIES } from '@/lib/tag-categories'

interface CategoryButtonBarProps {
  activeSlug?: string // Currently active category slug (if on CategoryPage)
}

export function CategoryButtonBar({ activeSlug }: CategoryButtonBarProps) {
  const navigate = useNavigate()

  return (
    <div className="w-full overflow-x-auto scroll-smooth scrollbar-hide">
      <div className="flex gap-2 py-4 min-w-max">
        {TAG_CATEGORIES.map(category => {
          const isActive = activeSlug === category.slug

          return (
            <Button
              key={category.slug}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="shrink-0"
              onClick={() => navigate(`/category/${category.slug}`)}
            >
              {category.name}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
