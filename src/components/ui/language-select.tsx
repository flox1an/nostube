import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ISO 639-1 language codes with flags and native names
// Language names are NOT translated - they appear in their native form
export const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'es', flag: '🇪🇸', name: 'Español' },
  { code: 'fr', flag: '🇫🇷', name: 'Français' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano' },
  { code: 'pt', flag: '🇧🇷', name: 'Português' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский' },
  { code: 'ja', flag: '🇯🇵', name: '日本語' },
  { code: 'zh', flag: '🇨🇳', name: '中文' },
  { code: 'ko', flag: '🇰🇷', name: '한국어' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية' },
  { code: 'hi', flag: '🇮🇳', name: 'हिन्दी' },
  { code: 'nl', flag: '🇳🇱', name: 'Nederlands' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski' },
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
  { code: 'vi', flag: '🇻🇳', name: 'Tiếng Việt' },
  { code: 'th', flag: '🇹🇭', name: 'ไทย' },
  { code: 'id', flag: '🇮🇩', name: 'Bahasa Indonesia' },
  { code: 'cs', flag: '🇨🇿', name: 'Čeština' },
  { code: 'da', flag: '🇩🇰', name: 'Dansk' },
  { code: 'fi', flag: '🇫🇮', name: 'Suomi' },
  { code: 'no', flag: '🇳🇴', name: 'Norsk' },
  { code: 'sv', flag: '🇸🇪', name: 'Svenska' },
  { code: 'el', flag: '🇬🇷', name: 'Ελληνικά' },
  { code: 'he', flag: '🇮🇱', name: 'עברית' },
  { code: 'hu', flag: '🇭🇺', name: 'Magyar' },
  { code: 'ro', flag: '🇷🇴', name: 'Română' },
  { code: 'uk', flag: '🇺🇦', name: 'Українська' },
  { code: 'bn', flag: '🇧🇩', name: 'বাংলা' },
  { code: 'fa', flag: '🇮🇷', name: 'فارسی' },
  { code: 'ms', flag: '🇲🇾', name: 'Bahasa Melayu' },
  { code: 'ur', flag: '🇵🇰', name: 'اردو' },
  { code: 'ta', flag: '🇱🇰', name: 'தமிழ்' },
  { code: 'te', flag: '🇮🇳', name: 'తెలుగు' },
  { code: 'mr', flag: '🇮🇳', name: 'मराठी' },
  { code: 'kn', flag: '🇮🇳', name: 'ಕನ್ನಡ' },
  { code: 'ml', flag: '🇮🇳', name: 'മലയാളം' },
  { code: 'gu', flag: '🇮🇳', name: 'ગુજરાતી' },
  { code: 'pa', flag: '🇮🇳', name: 'ਪੰਜਾਬੀ' },
] as const

// Sentinel value for "no language selected" (Radix Select doesn't allow empty string values)
const NONE_VALUE = '__none__'

interface LanguageSelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  id?: string
  allowNone?: boolean
  noneLabel?: string
}

export function LanguageSelect({
  value,
  onValueChange,
  placeholder,
  id,
  allowNone = false,
  noneLabel = 'None',
}: LanguageSelectProps) {
  // Convert empty string to sentinel value for Radix Select
  const selectValue = value === '' ? NONE_VALUE : value

  // Convert sentinel value back to empty string for parent
  const handleValueChange = (newValue: string) => {
    onValueChange(newValue === NONE_VALUE ? '' : newValue)
  }

  return (
    <Select value={selectValue} onValueChange={handleValueChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[80]">
        {allowNone && <SelectItem value={NONE_VALUE}>🏳️ {noneLabel}</SelectItem>}
        {LANGUAGES.map(lang => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.flag} {lang.name} ({lang.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
