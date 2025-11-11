import { useAppContext } from '@/hooks'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { type NsfwFilter } from '@/contexts/AppContext'
import { defaultResizeServer } from '../../App'

export function GeneralSettingsSection() {
  const { config, updateConfig } = useAppContext()

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
