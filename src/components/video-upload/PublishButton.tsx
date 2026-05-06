import { ChevronDown, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface PublishButtonProps {
  isPublishing: boolean
  disabled: boolean
  /** All write relays the user has configured. */
  writeRelays: string[]
  /** Currently selected relay URLs. null = all write relays. */
  selectedRelays: string[] | null
  onSelectedRelaysChange: (relays: string[] | null) => void
}

function deriveLabel(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function PublishButton({
  isPublishing,
  disabled,
  writeRelays,
  selectedRelays,
  onSelectedRelaysChange,
}: PublishButtonProps) {
  const { t } = useTranslation()

  // Effective selection: null means all
  const effective = selectedRelays ?? writeRelays
  const allSelected = effective.length === writeRelays.length

  function toggle(url: string, checked: boolean) {
    const current = selectedRelays ?? writeRelays
    const next = checked ? [...current, url] : current.filter(r => r !== url)
    // If everything is selected, collapse back to null (= all)
    onSelectedRelaysChange(next.length === writeRelays.length ? null : next)
  }

  // No relay picker needed when there is only one relay
  if (writeRelays.length <= 1) {
    return (
      <Button type="submit" disabled={isPublishing || disabled}>
        {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isPublishing ? t('upload.publishing') : t('upload.publishVideo')}
      </Button>
    )
  }

  return (
    <div className="flex items-stretch">
      <Button
        type="submit"
        disabled={isPublishing || disabled || effective.length === 0}
        className="rounded-r-none border-r-0"
      >
        {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isPublishing
          ? t('upload.publishing')
          : allSelected || effective.length === 0
            ? t('upload.publishVideo')
            : t('upload.publishVideoToRelays', {
                defaultValue: 'Publish to {{count}} relays',
                count: effective.length,
              })}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            disabled={isPublishing}
            className="rounded-l-none px-2"
            aria-label={t('upload.selectRelays', { defaultValue: 'Select relays' })}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>
            {t('upload.publishToRelays', { defaultValue: 'Publish to relays' })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {writeRelays.map(url => (
            <DropdownMenuCheckboxItem
              key={url}
              checked={effective.includes(url)}
              onCheckedChange={checked => toggle(url, checked)}
              onSelect={e => e.preventDefault()}
            >
              <span className="truncate font-mono text-xs">{deriveLabel(url)}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {!allSelected && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={false}
                onCheckedChange={() => onSelectedRelaysChange(null)}
                onSelect={e => e.preventDefault()}
              >
                {t('upload.selectAllRelays', { defaultValue: 'Select all' })}
              </DropdownMenuCheckboxItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
