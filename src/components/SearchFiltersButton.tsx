import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import {
  DEFAULT_SEARCH_FILTERS,
  getActiveSearchFilterCount,
  type SearchDateFilter,
  type SearchDurationFilter,
  type SearchFeatureFilter,
  type SearchFilters,
  type SearchSortFilter,
  type SearchTypeFilter,
} from '@/lib/search-filters'

interface SearchFiltersButtonProps {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
}

const typeOptions: { value: SearchTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'videos', label: 'Videos' },
  { value: 'shorts', label: 'Shorts' },
  { value: 'audio', label: 'Audio' },
]

const durationOptions: { value: SearchDurationFilter; label: string }[] = [
  { value: 'any', label: 'Any duration' },
  { value: 'short', label: 'Under 3 minutes' },
  { value: 'medium', label: '3-20 minutes' },
  { value: 'long', label: 'Over 20 minutes' },
]

const dateOptions: { value: SearchDateFilter; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
]

const featureOptions: { value: SearchFeatureFilter; label: string }[] = [
  { value: 'captions', label: 'Captions' },
  { value: 'hd', label: 'HD' },
  { value: 'nostr', label: 'Nostr native' },
]

const sortOptions: { value: SearchSortFilter; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'duration', label: 'Longest first' },
]

function FilterRadioGroup<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <RadioGroup value={value} onValueChange={onChange} className="gap-2">
        {options.map(option => {
          const id = `search-filter-${title}-${option.value}`
          return (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem id={id} value={option.value} />
              <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                {option.label}
              </Label>
            </div>
          )
        })}
      </RadioGroup>
    </section>
  )
}

export function SearchFiltersButton({ filters, onChange }: SearchFiltersButtonProps) {
  const activeCount = getActiveSearchFilterCount(filters)

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleFeature = (feature: SearchFeatureFilter, checked: boolean) => {
    const nextFeatures = checked
      ? [...new Set([...filters.features, feature])]
      : filters.features.filter(value => value !== feature)
    setFilter('features', nextFeatures)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={activeCount > 0 ? 'default' : 'outline'} size="sm" className="gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filter</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 text-xs">{activeCount}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(calc(100vw-2rem),42rem)] p-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-base font-semibold">Search filters</h2>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={() => onChange(DEFAULT_SEARCH_FILTERS)}
            >
              <X className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
        <Separator />
        <div className="grid gap-6 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <FilterRadioGroup
            title="Type"
            value={filters.type}
            options={typeOptions}
            onChange={value => setFilter('type', value)}
          />
          <FilterRadioGroup
            title="Duration"
            value={filters.duration}
            options={durationOptions}
            onChange={value => setFilter('duration', value)}
          />
          <FilterRadioGroup
            title="Upload date"
            value={filters.date}
            options={dateOptions}
            onChange={value => setFilter('date', value)}
          />
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Features</h3>
              <div className="space-y-2">
                {featureOptions.map(option => {
                  const id = `search-filter-feature-${option.value}`
                  return (
                    <div key={option.value} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={filters.features.includes(option.value)}
                        onCheckedChange={checked => toggleFeature(option.value, checked === true)}
                      />
                      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                        {option.label}
                      </Label>
                    </div>
                  )
                })}
              </div>
            </section>
            <FilterRadioGroup
              title="Sort by"
              value={filters.sort}
              options={sortOptions}
              onChange={value => setFilter('sort', value)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
