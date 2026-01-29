import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { PeoplePicker, type SelectedPerson } from '@/components/ui/people-picker'

interface PeoplePickerSectionProps {
  people: SelectedPerson[]
  onPeopleChange: (people: SelectedPerson[]) => void
}

export function PeoplePickerSection({ people, onPeopleChange }: PeoplePickerSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="people">{t('upload.people.label')}</Label>
      <p className="text-sm text-muted-foreground">{t('upload.people.description')}</p>
      <PeoplePicker
        id="people"
        people={people}
        onPeopleChange={onPeopleChange}
        placeholder={t('upload.people.placeholder')}
      />
    </div>
  )
}
