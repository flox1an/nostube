import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

interface SearchBarProps {
  allTags: string[]
  onSearch: (query: string) => void
  onTagsChange: (tags: string[]) => void
  className?: string
}

export function SearchBar({ allTags, onSearch, onTagsChange, className }: SearchBarProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showTagMenu] = useState(false)
  const debouncedSearch = useDebounce(searchTerm, 300)

  useEffect(() => {
    onSearch(debouncedSearch)
  }, [debouncedSearch, onSearch])

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag]

    setSelectedTags(newTags)
    onTagsChange(newTags)
  }

  const clearSearch = () => {
    setSearchTerm('')
    setSelectedTags([])
    onSearch('')
    onTagsChange([])
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="hidden md:flex gap-2 items-center justify-center">
        <div className="relative flex-1 max-w-[20em]">
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 "
            placeholder="Search videos..."
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          {(searchTerm || selectedTags.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2 h-6 w-6 p-0"
              onClick={clearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {/*
        <Button
          variant="outline"
          onClick={() => setShowTagMenu(!showTagMenu)}
        >
          Filter Tags
        </Button>
        */}
      </div>

      {showTagMenu && (
        <Card className="p-4">
          <ScrollArea className="h-[200px]">
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => toggleTag(tag)}
            >
              {tag}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
