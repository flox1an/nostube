import { useAppContext } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { type NsfwFilter } from '@/contexts/AppContext'
import { defaultResizeServer } from '../../App'
import { useTheme } from '@/providers/theme-provider'
import { availableThemes } from '@/lib/themes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function GeneralSettingsSection() {
  const { config, updateConfig } = useAppContext()
  const { theme, setTheme, colorTheme, setColorTheme } = useTheme()

  const handleThumbServerChange = (value: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      thumbResizeServerUrl: value.trim() || undefined,
    }))
  }

  const handleNsfwFilterChange = (value: NsfwFilter) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      nsfwFilter: value,
    }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>Configure general application preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme Mode */}
        <div className="space-y-3">
          <Label>Theme Mode</Label>
          <RadioGroup value={theme} onValueChange={value => setTheme(value as 'light' | 'dark' | 'system')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="light" id="theme-light" />
              <Label htmlFor="theme-light" className="font-normal cursor-pointer">
                Light
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="dark" id="theme-dark" />
              <Label htmlFor="theme-dark" className="font-normal cursor-pointer">
                Dark
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="system" id="theme-system" />
              <Label htmlFor="theme-system" className="font-normal cursor-pointer">
                System (Auto)
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Choose between light and dark mode, or use your system preference.
          </p>
        </div>

        {/* Color Theme */}
        <div className="space-y-2">
          <Label htmlFor="color-theme">Color Theme</Label>
          <Select value={colorTheme} onValueChange={setColorTheme}>
            <SelectTrigger id="color-theme">
              <SelectValue placeholder="Select a color theme" />
            </SelectTrigger>
            <SelectContent>
              {availableThemes.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose a color scheme for the application interface.
          </p>
        </div>

        {/* Thumbnail Resize Server */}
        <div className="space-y-2">
          <Label htmlFor="thumb-server">Thumbnail Resize Server URL</Label>
          <Input
            id="thumb-server"
            type="url"
            placeholder={defaultResizeServer}
            value={config.thumbResizeServerUrl || ''}
            onChange={e => handleThumbServerChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Server URL for resizing video thumbnails and profile images.
          </p>
        </div>

        {/* NSFW Filter */}
        <div className="space-y-3">
          <Label>NSFW Content Filter</Label>
          <RadioGroup value={config.nsfwFilter} onValueChange={handleNsfwFilterChange}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="hide" id="nsfw-hide" />
              <Label htmlFor="nsfw-hide" className="font-normal cursor-pointer">
                Hide - Don't show NSFW content
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="warning" id="nsfw-warning" />
              <Label htmlFor="nsfw-warning" className="font-normal cursor-pointer">
                Warning - Show blurred with warning
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="show" id="nsfw-show" />
              <Label htmlFor="nsfw-show" className="font-normal cursor-pointer">
                Show - Always show NSFW content
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Control how NSFW (Not Safe For Work) content is displayed in the app.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
