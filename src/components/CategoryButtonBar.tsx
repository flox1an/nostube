import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TAG_CATEGORIES } from '@/lib/tag-categories'

interface CategoryButtonBarProps {
  activeSlug?: string // Currently active category slug (if on CategoryPage)
}

export function CategoryButtonBar({ activeSlug }: CategoryButtonBarProps) {
  const navigate = useNavigate()

  return (
    <div className="w-full overflow-x-auto scroll-smooth scrollbar-hide sticky top-[env(safe-area-inset-top,0)] z-40 bg-background/80 backdrop-blur-md">
      <div className="flex gap-2 p-2 min-w-max">
        <Button
          variant={!activeSlug ? 'default' : 'outline'}
          size="sm"
          className="shrink-0 rounded-full px-4"
          onClick={() => navigate('/')}
        >
          All
        </Button>
        {TAG_CATEGORIES.map(category => {
          const isActive = activeSlug === category.slug

          return (
            <Button
              key={category.slug}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 rounded-full px-4"
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
