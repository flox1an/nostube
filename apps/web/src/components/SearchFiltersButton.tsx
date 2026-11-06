import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@nostube/widgets/components/button'
import { Checkbox } from '@nostube/widgets/components/checkbox'
import { Label } from '@nostube/widgets/components/label'
import { Popover, PopoverContent, PopoverTrigger } from '@nostube/widgets/components/popover'
import { RadioGroup, RadioGroupItem } from '@nostube/widgets/components/radio-group'
import { Separator } from '@nostube/widgets/components/separator'
import { useIsMobile } from '@nostube/widgets/hooks/useIsMobile'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
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
  resultStatus: string
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

/** Whole row is the hit target; selection and keyboard focus show on the row, not the tiny control. */
const OPTION_ROW_CLASS =
  'flex cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-normal transition-colors hover:bg-accent has-[[data-state=checked]]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring'
const OPTION_CONTROL_CLASS = 'focus-visible:ring-0 focus-visible:ring-offset-0'

function FilterRadioGroup<T extends string>({
  title,
  value,
  options,
  onChange,
  rowClassName,
}: {
  title: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  rowClassName: string
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <RadioGroup value={value} onValueChange={onChange} className="gap-1" aria-label={title}>
        {options.map(option => {
          const id = `search-filter-${title}-${option.value}`
          return (
            <Label key={option.value} htmlFor={id} className={rowClassName}>
              <RadioGroupItem id={id} value={option.value} className={OPTION_CONTROL_CLASS} />
              {option.label}
            </Label>
          )
        })}
      </RadioGroup>
    </section>
  )
}

export function SearchFiltersButton({ filters, onChange, resultStatus }: SearchFiltersButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const activeCount = getActiveSearchFilterCount(filters)
  const rowClassName = cn(OPTION_ROW_CLASS, isMobile ? 'min-h-11 px-3' : 'min-h-8')

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleFeature = (feature: SearchFeatureFilter, checked: boolean) => {
    const nextFeatures = checked
      ? [...new Set([...filters.features, feature])]
      : filters.features.filter(value => value !== feature)
    setFilter('features', nextFeatures)
  }

  const trigger = (
    <Button
      variant={activeCount > 0 ? 'default' : 'outline'}
      size="sm"
      className={cn('shrink-0 gap-2', isMobile && 'h-11 px-4')}
      aria-pressed={activeCount > 0}
      aria-label={
        activeCount > 0
          ? t('pages.search.filtersActive', { count: activeCount })
          : t('pages.search.filters')
      }
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span>{t('pages.search.filters')}</span>
      {activeCount > 0 && (
        <span className="rounded-full bg-background/20 px-1.5 text-xs">{activeCount}</span>
      )}
    </Button>
  )

  const groups = (
    <>
      <FilterRadioGroup
        title="Type"
        value={filters.type}
        options={typeOptions}
        onChange={value => setFilter('type', value)}
        rowClassName={rowClassName}
      />
      <FilterRadioGroup
        title="Duration"
        value={filters.duration}
        options={durationOptions}
        onChange={value => setFilter('duration', value)}
        rowClassName={rowClassName}
      />
      <FilterRadioGroup
        title="Upload date"
        value={filters.date}
        options={dateOptions}
        onChange={value => setFilter('date', value)}
        rowClassName={rowClassName}
      />
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Features</h3>
          <div className="grid gap-1">
            {featureOptions.map(option => {
              const id = `search-filter-feature-${option.value}`
              return (
                <Label key={option.value} htmlFor={id} className={rowClassName}>
                  <Checkbox
                    id={id}
                    className={OPTION_CONTROL_CLASS}
                    checked={filters.features.includes(option.value)}
                    onCheckedChange={checked => toggleFeature(option.value, checked === true)}
                  />
                  {option.label}
                </Label>
              )
            })}
          </div>
        </section>
        <FilterRadioGroup
          title="Sort by"
          value={filters.sort}
          options={sortOptions}
          onChange={value => setFilter('sort', value)}
          rowClassName={rowClassName}
        />
      </div>
    </>
  )

  const feedback = (
    <div className="shrink-0 space-y-2 border-t px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
      <p role="status" aria-atomic="true" className="text-sm text-muted-foreground">
        {resultStatus}
      </p>
      <Button className="h-11 w-full" onClick={() => setOpen(false)}>
        {t('pages.search.showResults')}
      </Button>
    </div>
  )

  // Changes apply immediately; the result feedback and return action stay visible while options scroll.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby="search-filter-help"
          className="flex max-h-[85dvh] flex-col gap-0 rounded-t-xl p-0"
        >
          <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b pl-4 pr-12">
            <SheetTitle className="py-2 text-lg">{t('pages.search.filterTitle')}</SheetTitle>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-3"
              disabled={activeCount === 0}
              onClick={() => onChange(DEFAULT_SEARCH_FILTERS)}
            >
              {t('pages.search.resetFilters')}
            </Button>
          </div>
          <p id="search-filter-help" className="shrink-0 px-4 pt-3 text-sm text-muted-foreground">
            {t('pages.search.filtersInstant')}
          </p>
          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2">
            {groups}
          </div>
          {feedback}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        aria-describedby="search-filter-help"
        className="flex max-h-[min(85dvh,var(--radix-popover-content-available-height))] w-[min(calc(100vw-2rem),42rem)] flex-col p-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-base font-semibold">{t('pages.search.filterTitle')}</h2>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={() => onChange(DEFAULT_SEARCH_FILTERS)}
            >
              <X className="h-4 w-4" />
              {t('pages.search.resetFilters')}
            </Button>
          )}
        </div>
        <Separator />
        <p id="search-filter-help" className="shrink-0 px-4 pt-3 text-sm text-muted-foreground">
          {t('pages.search.filtersInstant')}
        </p>
        <div className="grid min-h-0 gap-6 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-4">
          {groups}
        </div>
        {feedback}
      </PopoverContent>
    </Popover>
  )
}
