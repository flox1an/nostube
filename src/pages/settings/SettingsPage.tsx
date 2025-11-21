import { GeneralSettingsSection } from '@/components/settings/GeneralSettingsSection'
import { RelaySettingsSection } from '@/components/settings/RelaySettingsSection'
import { BlossomServersSection } from '@/components/settings/BlossomServersSection'
import { CachingServersSection } from '@/components/settings/CachingServersSection'
import { MissingVideosSection } from '@/components/settings/MissingVideosSection'
import { CacheSettingsSection } from '@/components/settings/CacheSettingsSection'
import { useTranslation } from 'react-i18next'

export default function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="container mx-auto py-8 space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">{t('settings.title')}</h1>
      <GeneralSettingsSection />
      <RelaySettingsSection />
      <BlossomServersSection />
      <CachingServersSection />
      <CacheSettingsSection />
      <MissingVideosSection />
    </div>
  )
}
