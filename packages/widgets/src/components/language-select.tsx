import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nostube/widgets/components/select'

import { LANGUAGES } from '../languages'

// Sentinel value for "no language selected" (Radix Select doesn't allow empty string values)
const NONE_VALUE = '__none__'

interface LanguageSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  id?: string
  allowNone?: boolean
  noneLabel?: string
  disabled?: boolean
}

export function LanguageSelect({
  value,
  onValueChange,
  placeholder,
  id,
  allowNone = false,
  noneLabel = 'None',
  disabled,
}: LanguageSelectProps) {
  // Convert empty string to sentinel value for Radix Select
  const selectValue = value === '' ? NONE_VALUE : value

  // Convert sentinel value back to empty string for parent
  const handleValueChange = (newValue: string) => {
    onValueChange(newValue === NONE_VALUE ? '' : newValue)
  }

  return (
    <Select value={selectValue} onValueChange={handleValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[80]">
        {allowNone && <SelectItem value={NONE_VALUE}>🏳️ {noneLabel}</SelectItem>}
        {LANGUAGES.map(lang => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.flag} {lang.name} {lang.name !== lang.englishName && `(${lang.englishName})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
