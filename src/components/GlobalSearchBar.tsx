import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

export function GlobalSearchBar() {
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
  }

  return (
    <form onSubmit={handleSubmit} className="hidden md:flex gap-2 items-center">
      <div className="relative w-full max-w-[20em] lg:max-w-[28em] lg:w-[28em]">
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10"
          placeholder="Search videos..."
        />
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-6 w-6 p-0"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  )
}
