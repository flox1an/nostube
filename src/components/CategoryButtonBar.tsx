import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TAG_CATEGORIES } from '@/lib/tag-categories'
import { Check, ChevronDown, Globe, Plus, Wifi } from 'lucide-react'
import { cn, normalizeRelayUrl } from '@/lib/utils'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useState } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useTranslation } from 'react-i18next'

interface CategoryButtonBarProps {
  activeSlug?: string
  selectedRelay: string | null
  onRelayChange: (relay: string | null) => void
}

export function CategoryButtonBar({
  activeSlug,
  selectedRelay,
  onRelayChange,
}: CategoryButtonBarProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { config } = useAppContext()
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')

  // Get read relays from config
  const readRelays = config.relays.filter(r => r.tags.includes('read'))

  // Display label for the current selection
  const displayLabel = selectedRelay
    ? selectedRelay.replace(/^wss?:\/\//, '').replace(/\/$/, '')
    : t('relaySource.global')

  const isValidRelayInput = (value: string): boolean => {
    const trimmed = value.trim()
    if (!trimmed) return false
    const normalized = normalizeRelayUrl(trimmed)
    try {
      new URL(normalized)
      return true
    } catch {
      return false
    }
  }

  const handleSelectRelay = (relayUrl: string | null) => {
    onRelayChange(relayUrl)
    setOpen(false)
    setInputValue('')
  }

  const handleAddCustomRelay = (url: string) => {
    const normalized = normalizeRelayUrl(url)
    onRelayChange(normalized)
    setOpen(false)
    setInputValue('')
  }

  // Filter relays by input value (manual filtering since we use shouldFilter={false})
  const filteredRelays = readRelays.filter(
    relay =>
      !inputValue ||
      relay.name?.toLowerCase().includes(inputValue.toLowerCase()) ||
      relay.url.toLowerCase().includes(inputValue.toLowerCase())
  )

  // Show "Global" when no filter or when it matches
  const showGlobal = !inputValue || 'global'.includes(inputValue.toLowerCase())

  // Show custom relay option when input is a valid URL not already in the list
  const showCustom =
    inputValue &&
    isValidRelayInput(inputValue) &&
    !readRelays.some(r => r.url === normalizeRelayUrl(inputValue))

  return (
    <div className="w-full overflow-x-auto scroll-smooth scrollbar-hide sticky top-0 z-40 bg-background/80 backdrop-blur-md">
      <div className="flex gap-2 p-2 min-w-max">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              className="shrink-0 rounded-full px-3 gap-1.5"
            >
              {selectedRelay ? <Wifi className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
              <span className="max-w-32 truncate">{displayLabel}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t('relaySource.searchPlaceholder')}
                value={inputValue}
                onValueChange={setInputValue}
              />
              <CommandList>
                {showGlobal && (
                  <CommandGroup>
                    <CommandItem
                      value="global"
                      onSelect={() => handleSelectRelay(null)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedRelay === null ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <Globe className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="font-medium">{t('relaySource.global')}</span>
                        <span className="text-xs text-muted-foreground">
                          {t('relaySource.globalDescription', { count: readRelays.length })}
                        </span>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                )}
                {(filteredRelays.length > 0 || showCustom) && (
                  <>
                    {showGlobal && <CommandSeparator />}
                    <CommandGroup>
                      {filteredRelays.map(relay => {
                        const shortUrl = relay.url.replace(/^wss?:\/\//, '').replace(/\/$/, '')
                        return (
                          <CommandItem
                            key={relay.url}
                            value={relay.url}
                            onSelect={() => handleSelectRelay(relay.url)}
                            className="cursor-pointer"
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedRelay === relay.url ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{relay.name || shortUrl}</span>
                              <span className="text-xs text-muted-foreground">{relay.url}</span>
                            </div>
                          </CommandItem>
                        )
                      })}
                      {showCustom && (
                        <CommandItem
                          value={normalizeRelayUrl(inputValue)}
                          onSelect={() => handleAddCustomRelay(inputValue)}
                          className="cursor-pointer border-t"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          <div className="flex flex-col">
                            <span className="font-medium">{t('relaySource.addCustom')}</span>
                            <span className="text-xs text-muted-foreground">
                              {normalizeRelayUrl(inputValue)}
                            </span>
                          </div>
                        </CommandItem>
                      )}
                    </CommandGroup>
                  </>
                )}
                {!showGlobal && filteredRelays.length === 0 && !showCustom && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {inputValue ? t('relaySource.invalidUrl') : t('relaySource.noResults')}
                  </div>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

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
