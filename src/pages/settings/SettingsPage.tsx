import { GeneralSettingsSection } from '@/components/settings/GeneralSettingsSection'
import { RelaySettingsSection } from '@/components/settings/RelaySettingsSection'
import { BlossomServersSection } from '@/components/settings/BlossomServersSection'
import { CachingServersSection } from '@/components/settings/CachingServersSection'
import { MissingVideosSection } from '@/components/settings/MissingVideosSection'
import { CacheSettingsSection } from '@/components/settings/CacheSettingsSection'

export default function SettingsPage() {
  return (
    <div className="container mx-auto py-8 space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <GeneralSettingsSection />
      <RelaySettingsSection />
      <BlossomServersSection />
      <CachingServersSection />
      <CacheSettingsSection />
      <MissingVideosSection />
    </div>
  )
}
