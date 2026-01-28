import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ISO 639-1 language codes with flags, native names, and English names
export const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', name: 'English', englishName: 'English' },
  { code: 'es', flag: '🇪🇸', name: 'Español', englishName: 'Spanish' },
  { code: 'fr', flag: '🇫🇷', name: 'Français', englishName: 'French' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch', englishName: 'German' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano', englishName: 'Italian' },
  { code: 'pt', flag: '🇧🇷', name: 'Português', englishName: 'Portuguese' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский', englishName: 'Russian' },
  { code: 'ja', flag: '🇯🇵', name: '日本語', englishName: 'Japanese' },
  { code: 'zh', flag: '🇨🇳', name: '中文', englishName: 'Chinese' },
  { code: 'ko', flag: '🇰🇷', name: '한국어', englishName: 'Korean' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية', englishName: 'Arabic' },
  { code: 'hi', flag: '🇮🇳', name: 'हिन्दी', englishName: 'Hindi' },
  { code: 'nl', flag: '🇳🇱', name: 'Nederlands', englishName: 'Dutch' },
  { code: 'pl', flag: '🇵🇱', name: 'Polski', englishName: 'Polish' },
  { code: 'tr', flag: '🇹🇷', name: 'Türkçe', englishName: 'Turkish' },
  { code: 'vi', flag: '🇻🇳', name: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'th', flag: '🇹🇭', name: 'ไทย', englishName: 'Thai' },
  { code: 'id', flag: '🇮🇩', name: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'cs', flag: '🇨🇿', name: 'Čeština', englishName: 'Czech' },
  { code: 'da', flag: '🇩🇰', name: 'Dansk', englishName: 'Danish' },
  { code: 'fi', flag: '🇫🇮', name: 'Suomi', englishName: 'Finnish' },
  { code: 'no', flag: '🇳🇴', name: 'Norsk', englishName: 'Norwegian' },
  { code: 'sv', flag: '🇸🇪', name: 'Svenska', englishName: 'Swedish' },
  { code: 'el', flag: '🇬🇷', name: 'Ελληνικά', englishName: 'Greek' },
  { code: 'he', flag: '🇮🇱', name: 'עברית', englishName: 'Hebrew' },
  { code: 'hu', flag: '🇭🇺', name: 'Magyar', englishName: 'Hungarian' },
  { code: 'ro', flag: '🇷🇴', name: 'Română', englishName: 'Romanian' },
  { code: 'uk', flag: '🇺🇦', name: 'Українська', englishName: 'Ukrainian' },
  { code: 'bn', flag: '🇧🇩', name: 'বাংলা', englishName: 'Bengali' },
  { code: 'fa', flag: '🇮🇷', name: 'فارسی', englishName: 'Persian' },
  { code: 'ms', flag: '🇲🇾', name: 'Bahasa Melayu', englishName: 'Malay' },
  { code: 'ur', flag: '🇵🇰', name: 'اردو', englishName: 'Urdu' },
  { code: 'ta', flag: '🇱🇰', name: 'தமிழ்', englishName: 'Tamil' },
  { code: 'te', flag: '🇮🇳', name: 'తెలుగు', englishName: 'Telugu' },
  { code: 'mr', flag: '🇮🇳', name: 'मराठी', englishName: 'Marathi' },
  { code: 'kn', flag: '🇮🇳', name: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { code: 'ml', flag: '🇮🇳', name: 'മലയാളം', englishName: 'Malayalam' },
  { code: 'gu', flag: '🇮🇳', name: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'pa', flag: '🇮🇳', name: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
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
            {lang.flag} {lang.name} {lang.name !== lang.englishName && `(${lang.englishName})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
