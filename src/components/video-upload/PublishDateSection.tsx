import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CalendarIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface PublishDateSectionProps {
  value?: number // Unix timestamp in seconds, undefined = now
  onChange: (value: number | undefined) => void
}

export function PublishDateSection({ value, onChange }: PublishDateSectionProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'now' | 'scheduled'>(value ? 'scheduled' : 'now')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (value) {
      return new Date(value * 1000)
    }
    return undefined
  })
  const [timeValue, setTimeValue] = useState(() => {
    if (value) {
      const date = new Date(value * 1000)
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    }
    // Default to current time rounded to next hour
    const now = new Date()
    now.setHours(now.getHours() + 1, 0, 0, 0)
    return `${now.getHours().toString().padStart(2, '0')}:00`
  })

  // Update the timestamp when date or time changes
  useEffect(() => {
    if (mode === 'now') {
      onChange(undefined)
      return
    }

    if (selectedDate && timeValue) {
      const [hours, minutes] = timeValue.split(':').map(Number)
      const newDate = new Date(selectedDate)
      newDate.setHours(hours, minutes, 0, 0)
      onChange(Math.floor(newDate.getTime() / 1000))
    }
  }, [mode, selectedDate, timeValue, onChange])

  const handleModeChange = (newMode: string) => {
    setMode(newMode as 'now' | 'scheduled')
    if (newMode === 'scheduled' && !selectedDate) {
      // Default to tomorrow at the current time
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setSelectedDate(tomorrow)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>{t('upload.publishDate.title', { defaultValue: 'Publish Date' })}</Label>

      <RadioGroup value={mode} onValueChange={handleModeChange} className="flex flex-col gap-2">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="now" id="publish-now" />
          <Label htmlFor="publish-now" className="font-normal cursor-pointer">
            {t('upload.publishDate.now', { defaultValue: 'Publish immediately' })}
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="scheduled" id="publish-scheduled" />
          <Label htmlFor="publish-scheduled" className="font-normal cursor-pointer">
            {t('upload.publishDate.scheduled', { defaultValue: 'Set publishing time' })}
          </Label>
        </div>
      </RadioGroup>

      {mode === 'scheduled' && (
        <div className="flex flex-wrap gap-2 items-center mt-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[200px] justify-start text-left font-normal',
                  !selectedDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? formatDate(selectedDate) : t('upload.publishDate.pickDate')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                autoFocus
              />
            </PopoverContent>
          </Popover>

          <Input
            type="time"
            value={timeValue}
            onChange={e => setTimeValue(e.target.value)}
            className="w-[120px]"
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {mode === 'now'
          ? t('upload.publishDate.descriptionNow', {
              defaultValue: 'Your video will be published as soon as you click Publish.',
            })
          : t('upload.publishDate.descriptionScheduled', {
              defaultValue:
                'Your video will be published with the selected date/time. Note: The video will be visible immediately but dated for the scheduled time.',
            })}
      </p>
    </div>
  )
}
