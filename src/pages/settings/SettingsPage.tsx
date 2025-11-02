import { RelaySettingsSection } from '@/components/settings/RelaySettingsSection'
import { BlossomServersSection } from '@/components/settings/BlossomServersSection'
import { MissingVideosSection } from '@/components/settings/MissingVideosSection'

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <RelaySettingsSection />
      <BlossomServersSection />
      <MissingVideosSection />
    </div>
  )
}
