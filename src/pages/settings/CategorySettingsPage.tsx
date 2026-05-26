import { useParams, Navigate } from 'react-router-dom'
import { AppearanceSection } from '@/components/settings/AppearanceSection'
import { ContentSettingsSection } from '@/components/settings/ContentSettingsSection'
import { NetworkSettingsSection } from '@/components/settings/NetworkSettingsSection'
import { StorageSettingsSection } from '@/components/settings/StorageSettingsSection'
import { DataSection } from '@/components/settings/DataSection'
import { WalletSection } from '@/components/settings/WalletSection'
import { PresetsPage } from '@/pages/PresetsPage'

const categoryComponents: Record<string, React.ComponentType> = {
  appearance: AppearanceSection,
  content: ContentSettingsSection,
  network: NetworkSettingsSection,
  storage: StorageSettingsSection,
  data: DataSection,
  wallet: WalletSection,
  presets: PresetsPage,
}

export function CategorySettingsPage() {
  const { category } = useParams<{ category: string }>()

  if (!category || !categoryComponents[category]) {
    return <Navigate to="/settings/appearance" replace />
  }

  const Component = categoryComponents[category]

  return (
    <div>
      <Component />
    </div>
  )
}
